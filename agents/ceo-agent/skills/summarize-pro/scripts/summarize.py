#!/usr/bin/env python3
"""
summarize.py - Audio/Video Transcription + Scenario Analysis

Cross-platform (macOS / Linux / Windows).
Transcription: Platform transcription API (no user API Key needed).
Scenario Recognition: Keyword matching (no API needed).
Summarization: Handled by Agent using user-configured LLM (not in this script).
Optional: ffmpeg (format conversion/compression), yt-dlp (URL download).
"""

import argparse
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


# --- Print helpers ---
QUIET_MODE = False

def print_info(msg):
    if not QUIET_MODE:
        print(f"ℹ️  {msg}", file=sys.stderr)

def print_success(msg):
    print(f"✅ {msg}", file=sys.stderr)

def print_warning(msg):
    print(f"⚠️  {msg}", file=sys.stderr)

def print_error(msg):
    print(f"❌ {msg}", file=sys.stderr)

def print_step(msg):
    if not QUIET_MODE:
        print(f"👉 {msg}", file=sys.stderr)

def print_header(msg):
    if not QUIET_MODE:
        print(f"🦞 {msg}", file=sys.stderr)

def print_progress(msg):
    print(f"{msg}", file=sys.stderr)


# --- OS-aware install hint ---
def install_hint(pkg):
    system = platform.system()
    if system == "Darwin":
        return f"brew install {pkg}"
    elif system == "Windows":
        if shutil.which("winget"):
            return f"winget install {pkg}"
        elif shutil.which("choco"):
            return f"choco install {pkg}"
        elif shutil.which("scoop"):
            return f"scoop install {pkg}"
        return f"winget install {pkg}"
    else:  # Linux
        if shutil.which("apt-get"):
            return f"sudo apt-get install {pkg}"
        elif shutil.which("dnf"):
            return f"sudo dnf install {pkg}"
        elif shutil.which("pacman"):
            return f"sudo pacman -S {pkg}"
        return f"(please install {pkg} with your package manager)"


# --- Check transcription availability ---
def check_transcription_available():
    """Check if any transcription auth method is available."""
    import json as _json

    # Method 1: formData config
    secrets_path = os.path.join(SCRIPT_DIR, "..", "..", "..", ".secrets", "transcribe-config.json")
    if os.path.isfile(secrets_path):
        try:
            with open(secrets_path) as f:
                cfg = _json.load(f)
            if cfg.get("transcribe_api_key"):
                print_info("Transcription: formData API key")
                return True
        except Exception:
            pass

    # Method 2: environment variable
    if os.environ.get("TRANSCRIBE_API_KEY", "").strip():
        print_info("Transcription: environment variable")
        return True

    # Method 3: OpenClaw user identity
    openclaw_home = os.path.join(os.path.expanduser("~"), ".openclaw")
    userinfo_path = os.path.join(openclaw_home, "identity", "openclaw-userinfo.json")
    if os.path.isfile(userinfo_path):
        print_info("Transcription: Platform transcription API")
        return True

    # Method 4: OpenClaw model proxy (openclaw.json has API key for transcription model)
    config_path = os.path.join(openclaw_home, "openclaw.json")
    if os.path.isfile(config_path):
        try:
            with open(config_path) as f:
                cfg = _json.load(f)
            providers = cfg.get("models", {}).get("providers", {})
            for prov in providers.values():
                if prov.get("apiKey") or prov.get("headers", {}).get("x-api-key"):
                    print_info("Transcription: Platform model proxy")
                    return True
        except Exception:
            pass

    print_error("No transcription credentials found")
    print("")
    print("Configure one of the following:")
    print("  Option 1: Set transcribe_api_key in agent formData")
    print("  Option 2: Set TRANSCRIBE_API_KEY environment variable")
    print("  Option 3: Use an OpenClaw-compatible platform")
    print("")
    sys.exit(1)


# --- Download audio from URL ---
def download_from_url(url, output_file):
    print_info(f"Downloading: {url}")

    # Try yt-dlp first (handles YouTube, TikTok, Instagram, X, Bilibili, etc.)
    if shutil.which("yt-dlp"):
        print_step("Extracting audio with yt-dlp...")
        try:
            subprocess.run(
                ["yt-dlp", "-x", "--audio-format", "mp3",
                 "--postprocessor-args", "ffmpeg:-ar 16000 -ac 1",
                 "-o", output_file, url],
                check=True, capture_output=True
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass

    # Try direct download with urllib
    try:
        import urllib.request
        urllib.request.urlretrieve(url, output_file)
        if os.path.isfile(output_file) and os.path.getsize(output_file) > 0:
            return True
    except Exception:
        pass

    print_error("Download failed")
    print_info("yt-dlp is required for online video/audio")
    print_info(f"Install: {install_hint('yt-dlp')}")
    return False


# --- Transcribe: delegate to transcribe.py ---
def transcribe_audio(input_file, output_file, language):
    transcribe_script = os.path.join(SCRIPT_DIR, "transcribe.py")

    if not os.path.isfile(transcribe_script):
        print_error(f"transcribe.py not found: {transcribe_script}")
        return False

    cmd = [sys.executable, transcribe_script, input_file]
    if language:
        cmd += ["--language", language]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        if result.stderr:
            print_error(result.stderr.strip())
        return False
    # Write stdout (transcript text) to output_file
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(result.stdout)
    return True


# --- Keyword-based scenario recognition ---
SCENARIO_KEYWORDS = {
    "meeting": [
        "discussion", "decision", "action item", "agenda", "attendee",
        "meeting", "team", "deadline", "owner", "next step",
        "minutes", "follow-up", "assigned", "resolved", "consensus",
    ],
    "interview": [
        "interview", "interviewee", "pain point", "feedback", "user",
        "experience", "opinion", "insight", "respondent", "question",
        "hiring", "candidate", "role", "qualification", "background",
    ],
    "lecture": [
        "course", "lecture", "learning", "concept", "outline",
        "key point", "student", "lesson", "chapter", "explain",
        "assignment", "exam", "curriculum", "module", "exercise",
    ],
    "podcast": [
        "podcast", "guest", "episode", "host", "topic",
        "story", "opinion", "show", "sharing", "chat",
        "listener", "segment", "intro", "outro", "sponsor",
    ],
}

SCENARIO_PROMPTS = {
    "meeting": "Focus on: decisions made, action items, owners, and timelines. Output should include: meeting theme, discussion points, decisions, and action items.",
    "interview": "Focus on: interviewee background, core pain points, needs insights, and key opinions. Output should include: interviewee profile, core pain points, needs insights, and notable quotes.",
    "lecture": "Focus on: course outline, core knowledge points, and case studies. Output should include: course theme, knowledge outline, core concepts, and examples.",
    "podcast": "Focus on: topic list, guest opinions, and memorable quotes. Output should include: topic overview, guest opinions, and key quotes/stories.",
    "general": "Summarize the core points and key conclusions of the following content. Keep the structure clear with highlighted key points.",
}

SCENARIO_NAMES = {
    "meeting": "Meeting",
    "interview": "Interview",
    "lecture": "Lecture",
    "podcast": "Podcast",
    "general": "General Content",
}

SCENARIO_EMOJIS = {
    "meeting": "🗂",
    "interview": "🎤",
    "lecture": "📚",
    "podcast": "🎙",
    "general": "📝",
}


def analyze_content_type(text, force_type=""):
    if force_type:
        return {
            "type": force_type,
            "prompt": SCENARIO_PROMPTS.get(force_type, SCENARIO_PROMPTS["general"]),
        }

    if not QUIET_MODE:
        print_step("Scenario recognition: keyword matching...")

    preview = text[:3000].lower()
    scores = {}
    for scenario, keywords in SCENARIO_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in preview)
        scores[scenario] = score

    best_type = "general"
    best_score = 2  # threshold: need at least 3 hits
    for scenario, score in scores.items():
        if score > best_score:
            best_type = scenario
            best_score = score

    return {
        "type": best_type,
        "prompt": SCENARIO_PROMPTS.get(best_type, SCENARIO_PROMPTS["general"]),
    }


# --- Process input: determine file type ---
AUDIO_VIDEO_FORMATS = {
    "mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "flac", "ogg", "oga",
    "mov", "avi", "mkv", "flv", "wmv", "ts",
}
TEXT_FORMATS = {"txt", "md"}


def process_input(input_file):
    """Determine input type.

    Returns:
      "transcribe" - needs transcription (audio/video file path or downloaded URL)
      "text"       - text file, skip transcription
      None         - error
      The actual file path to process is returned as second element.
    """
    # URL: download first
    if re.match(r'^https?://', input_file):
        print_info(f"URL detected: {input_file}")
        temp_audio = os.path.join(
            tempfile.gettempdir(), f"summarize-download-{os.getpid()}.mp3"
        )
        result = download_from_url(input_file, temp_audio)
        if result:
            actual_file = result if isinstance(result, str) else temp_audio
            print_success("Download complete")
            return "transcribe", actual_file
        return None, None

    ext = os.path.splitext(input_file)[1].lstrip(".").lower()

    if ext in TEXT_FORMATS:
        print_info(f"Text file: .{ext}")
        return "text", input_file

    if ext in AUDIO_VIDEO_FORMATS:
        print_info(f"Audio/video format: .{ext}")
        return "transcribe", input_file

    # Unknown format - let transcribe.py try
    print_warning(f"Unknown format .{ext}, will attempt transcription")
    return "transcribe", input_file


# --- Generate analysis report ---
def generate_report(transcript_file, output_file, language, force_type):
    if not QUIET_MODE:
        print_header("Generating analysis report (scenario recognition + summary guidance)")
        print("")

    if not os.path.isfile(transcript_file):
        print_error(f"Transcript file not found: {transcript_file}")
        return False

    with open(transcript_file, "r", encoding="utf-8") as f:
        transcript = f.read()

    char_count = len(transcript)
    basename = os.path.splitext(os.path.basename(transcript_file))[0]
    basename = re.sub(r'-transcript.*', '', basename)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

    if not QUIET_MODE:
        print_info(f"Transcript: {char_count} characters")

    if char_count < 100:
        print_warning("Text too short, skipping analysis")
        return False

    if char_count > 50000 and not QUIET_MODE:
        print_warning(f"Long text ({char_count} characters), full content preserved")

    # Analyze content type
    analysis = analyze_content_type(transcript, force_type)
    content_type = analysis["type"]
    system_prompt = analysis["prompt"]
    type_name = SCENARIO_NAMES.get(content_type, "General Content")

    if not QUIET_MODE:
        print_info(f"Content type: {content_type}")
        print_info(f"Summary strategy: {system_prompt[:60]}...")
        print_step("Generating analysis report...")
    else:
        emoji = SCENARIO_EMOJIS.get(content_type, "📝")
        print_progress(f"{emoji} Scenario: {content_type}")

    # Estimate duration (rough: 150 words/min for English, 150 chars/min for other)
    est_min = char_count // 150
    est_duration = f"{est_min} min" if est_min >= 1 else "< 1 min"

    # Write report
    report = f"""# 📊 Transcription Analysis Report

**File**: {basename}
**Processed**: {timestamp}
**Content Type**: {type_name} ({content_type})
**Character Count**: {char_count}
**Estimated Duration**: {est_duration}

---

## 🎯 Scenario Recognition Result

**Scenario**: {type_name}

**Summary Strategy**:
{system_prompt}

---

## 📝 Full Transcript

{transcript}

---

## 🤖 Next Step

**Agent takes over**: OpenClaw Agent will now use the user-configured LLM to generate the summary.

**Suggested Prompt**:
```
Please generate a structured summary based on the "Summary Strategy" above.
Scenario type: {type_name}
Output format: Markdown
```

---

*Generated by Summarize Pro 🦞 | Transcription only, LLM-agnostic*
"""

    with open(output_file, "w", encoding="utf-8") as f:
        f.write(report)

    if not QUIET_MODE:
        print_success(f"Analysis report saved: {output_file}")
        print("")
        print_header("🎯 Transcription complete! Agent will now generate the summary.")
        print("")
        print_info(f"Scenario: {type_name}")
        print_info(f"Characters: {char_count}")
        print_info(f"Report: {output_file}")
        print("")
        print_step("Agent will use user-configured LLM model to complete the summary")

    return True


# --- Main processing ---
def _default_output_dir():
    """Auto output dir: <workspace_root>/summarizer-files/<timestamp>/"""
    workspace = os.path.join(SCRIPT_DIR, "..", "..", "..")
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return os.path.join(workspace, "summarizer-files", timestamp)


def process_file(input_file, output_dir, language, transcribe_only,
                 summarize_only, full_mode, force_type):

    is_url = re.match(r'^https?://', input_file)
    if not is_url and not os.path.isfile(input_file):
        print_error(f"File not found: {input_file}")
        sys.exit(1)

    basename = re.sub(r'\.[^.]*$', '', os.path.basename(input_file))
    # URL inputs: use a safe basename
    if is_url:
        basename = re.sub(r'[^\w\-]', '_', basename) or "url_input"

    if not QUIET_MODE:
        print_header("Summarize Pro - Audio/Video Transcription + Scenario Analysis")
        print("")
        print_info(f"Input: {input_file}")
        print_info(f"Output: {output_dir}")
        print_info(f"Transcription: Platform transcription API")
        print_info(f"Analysis: Keyword scenario recognition")
        print_info(f"Summary: Handled by Agent using user LLM")
        print("")
    else:
        print_progress(f"🎵 Processing: {os.path.basename(input_file)}")

    os.makedirs(output_dir, exist_ok=True)

    # Summary-only mode
    if summarize_only:
        summary_file = os.path.join(output_dir, f"{basename}-summary.md")
        generate_report(input_file, summary_file, language, force_type)
        return

    transcript_file = os.path.join(output_dir, f"{basename}-transcript.txt")
    summary_file = os.path.join(output_dir, f"{basename}-summary.md")

    # Step 1: Determine input type
    if not QUIET_MODE:
        print_step("Processing input file...")
    else:
        print_progress("📂 Preparing file...")

    input_type, actual_file = process_input(input_file)

    if input_type is None:
        sys.exit(1)

    if input_type == "text":
        # Text file, just copy
        shutil.copy2(actual_file, transcript_file)
        if not QUIET_MODE:
            print_success(f"Text file copied: {transcript_file}")
    else:
        # Step 2: Transcribe via platform API
        if not QUIET_MODE:
            print_step("Transcribing via platform API...")
        else:
            print_progress("🎙️ Transcribing...")

        is_downloaded = actual_file != input_file
        if not transcribe_audio(actual_file, transcript_file, language):
            print_error("Transcription failed")
            if is_downloaded:
                _cleanup(actual_file)
            sys.exit(1)

        if not QUIET_MODE:
            print_success(f"Transcript saved: {transcript_file}")
        else:
            print_progress("✅ Transcription complete")

        if is_downloaded:
            _cleanup(actual_file)

    # Transcribe-only mode
    if transcribe_only:
        print_success("Transcription complete!")
        return

    if not QUIET_MODE:
        print("")

    # Step 3: Generate analysis report
    if QUIET_MODE:
        print_progress("🎯 Recognizing scenario...")

    generate_report(transcript_file, summary_file, language, force_type)

    if not QUIET_MODE:
        print("")
        print_header("Done!")
        print("")
        print_info("Output files:")
        print(f"  • Transcript: {transcript_file}", file=sys.stderr)
        if os.path.isfile(summary_file):
            print(f"  • Report: {summary_file}", file=sys.stderr)
    else:
        print_success("Analysis report generated")
        print(summary_file)


def _cleanup(path):
    try:
        if os.path.isfile(path):
            os.remove(path)
    except OSError:
        pass


# --- CLI ---
def main():
    global QUIET_MODE

    parser = argparse.ArgumentParser(
        description="Summarize Pro - Audio/Video Transcription + Intelligent Summarization",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Supported formats:
  Audio:  mp3, wav, m4a, flac, ogg, oga, mpga, mpeg
  Video:  mp4, webm (native support)
  Video:  mov, avi, mkv, flv (requires ffmpeg)
  Text:   txt, md (direct analysis, skips transcription)
  URL:    https:// (YouTube, TikTok, Instagram, X, etc., requires yt-dlp)

Authentication:
  Uses platform transcription API (no user API Key needed).
  Requires: ~/.openclaw/identity/openclaw-userinfo.json (auto-created on login).
"""
    )
    parser.add_argument("input", help="Audio/video/text file or URL")
    parser.add_argument("-o", "--output", default=None,
                        help="Output directory (default: auto-created summarizer-files/<timestamp>/ under workspace)")
    parser.add_argument("-l", "--language", default=None,
                        help="Language code (default: auto-detect)")
    parser.add_argument("-t", "--transcribe-only", action="store_true", help="Transcription only")
    parser.add_argument("--summarize-only", action="store_true", help="Scenario analysis only (input must be text)")
    parser.add_argument("--type", dest="force_type", default="",
                        help="Force content type (meeting/interview/lecture/podcast/general)")
    parser.add_argument("-f", "--full", action="store_true", help="Full mode: transcribe + analysis")
    parser.add_argument("-q", "--quiet", action="store_true", help="Quiet mode (for Agent calls)")

    args = parser.parse_args()
    QUIET_MODE = args.quiet

    check_transcription_available()

    output_dir = args.output if args.output else _default_output_dir()

    process_file(
        args.input, output_dir, args.language,
        args.transcribe_only, args.summarize_only,
        args.full, args.force_type
    )


if __name__ == "__main__":
    main()
