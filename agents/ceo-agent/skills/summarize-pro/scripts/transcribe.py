#!/usr/bin/env python3
"""
transcribe.py - Audio transcription via OpenAI-compatible API

Auth priority (highest to lowest):
  1. .secrets/transcribe-config.json  (formData / user-configured)
  2. Environment variables: TRANSCRIBE_API_KEY, TRANSCRIBE_BASE_URL
  3. ~/.openclaw/ runtime (OpenClaw platform auto-inject)

Usage: python3 transcribe.py <audio_file> [--language en]
"""

import argparse
import json
import os
import ssl
import subprocess
import sys
import urllib.request

# --- Auto-configure SSL (macOS) ---
if not os.environ.get('SSL_CERT_FILE'):
    try:
        result = subprocess.run([sys.executable, '-m', 'certifi'],
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            cert_path = result.stdout.strip()
            if os.path.exists(cert_path):
                os.environ['SSL_CERT_FILE'] = cert_path
    except:
        pass

import re

MODEL = os.environ.get("TRANSCRIBE_MODEL", "gpt-4o-transcribe")

OPENCLAW_HOME = os.path.join(os.path.expanduser("~"), ".openclaw")

# --- Workspace root (script is at skills/summarize-pro/scripts/) ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORKSPACE_ROOT = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "..", ".."))
SECRETS_PATH = os.path.join(WORKSPACE_ROOT, ".secrets", "transcribe-config.json")


def _load_auth():
    """
    Load API key and base URL with priority:
    1. .secrets/transcribe-config.json (formData config)
    2. Environment variables
    3. ~/.openclaw/ runtime
    """

    # Priority 1: formData config
    if os.path.isfile(SECRETS_PATH):
        try:
            with open(SECRETS_PATH) as f:
                cfg = json.load(f)
            api_key = cfg.get("transcribe_api_key", "").strip()
            base_url = cfg.get("transcribe_base_url", "").strip() or "https://api.openai.com/v1"
            if api_key:
                return api_key, base_url.rstrip("/"), "formData"
        except Exception:
            pass

    # Priority 2: environment variables
    api_key = os.environ.get("TRANSCRIBE_API_KEY", "").strip()
    base_url = os.environ.get("TRANSCRIBE_BASE_URL", "").strip() or "https://api.openai.com/v1"
    if api_key:
        return api_key, base_url.rstrip("/"), "env"

    # Priority 3: ~/.openclaw/ runtime (OpenClaw platform auto-inject)
    userinfo_path = os.path.join(OPENCLAW_HOME, "identity", "openclaw-userinfo.json")
    config_path = os.path.join(OPENCLAW_HOME, "openclaw.json")
    if os.path.isfile(userinfo_path):
        try:
            with open(userinfo_path) as f:
                auth = json.load(f)
            uid_key   = next(k for k in auth if re.search(r'uid',   k, re.I))
            token_key = next(k for k in auth if re.search(r'token', k, re.I))
            uid   = auth[uid_key]
            token = auth[token_key]
            # Read baseUrl from openclaw.json
            base_url = "https://api.openai.com/v1"
            if os.path.isfile(config_path):
                with open(config_path) as f:
                    cfg = json.load(f)
                providers = cfg.get("models", {}).get("providers", {})
                for provider in providers.values():
                    for k, v in provider.items():
                        if re.search(r'base.?url', k, re.I) and isinstance(v, str) and v.startswith("http"):
                            base_url = v.rstrip("/")
                            break
            return f"{uid}:{token}", base_url, "openclaw-runtime"
        except Exception:
            pass

    # Priority 4: OpenClaw model proxy (openclaw.json — prefer provider with transcription model)
    config_path = os.path.join(OPENCLAW_HOME, "openclaw.json")
    if os.path.isfile(config_path):
        try:
            with open(config_path) as f:
                cfg = json.load(f)
            providers = cfg.get("models", {}).get("providers", {})
            # First pass: find provider that has a transcription model
            for pname, prov in providers.items():
                models = [m.get("id", "") for m in prov.get("models", [])]
                has_transcribe = any("transcribe" in m for m in models)
                if has_transcribe:
                    api_key = prov.get("apiKey") or prov.get("headers", {}).get("x-api-key", "")
                    base_url = prov.get("baseUrl", "").rstrip("/")
                    if api_key and base_url:
                        return api_key, base_url, "openclaw-proxy"
            # Second pass: any provider with credentials
            for pname, prov in providers.items():
                api_key = prov.get("apiKey") or prov.get("headers", {}).get("x-api-key", "")
                base_url = prov.get("baseUrl", "").rstrip("/")
                if api_key and base_url:
                    return api_key, base_url, "openclaw-proxy"
        except Exception:
            pass

    # Nothing found
    print("Error: No transcription API credentials found.", file=sys.stderr)
    print("", file=sys.stderr)
    print("Configure one of the following:", file=sys.stderr)
    print("  Option 1 (recommended): Set transcribe_api_key in agent formData", file=sys.stderr)
    print("  Option 2: Set TRANSCRIBE_API_KEY environment variable", file=sys.stderr)
    print("  Option 3: Use an OpenClaw-compatible platform with built-in transcription", file=sys.stderr)
    sys.exit(1)


# --- Transcribe ---
def transcribe(file_path, language=None):
    """Upload audio and get transcription."""
    api_key, base_url, auth_source = _load_auth()

    with open(file_path, "rb") as f:
        file_data = f.read()

    filename = os.path.basename(file_path)
    boundary = "----Boundary"

    body = b""
    body += f'--{boundary}\r\n'.encode()
    body += f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n\r\n'.encode()
    body += file_data
    body += f'\r\n--{boundary}\r\n'.encode()
    body += b'Content-Disposition: form-data; name="model"\r\n\r\n'
    body += MODEL.encode()
    if language:
        body += f'\r\n--{boundary}\r\n'.encode()
        body += b'Content-Disposition: form-data; name="language"\r\n\r\n'
        body += language.encode()
    body += f'\r\n--{boundary}--\r\n'.encode()

    # Build auth header: Bearer for API key, X-Auth-* for openclaw runtime
    if auth_source == "openclaw-runtime" and ":" in api_key:
        uid, token = api_key.split(":", 1)
        headers = {
            "X-Auth-Uid": uid,
            "X-Auth-Token": token,
            "Content-Type": f"multipart/form-data; boundary={boundary}"
        }
    else:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": f"multipart/form-data; boundary={boundary}"
        }

    req = urllib.request.Request(
        f"{base_url}/audio/transcriptions",
        data=body,
        headers=headers
    )

    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


# --- Main ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transcribe audio via OpenAI-compatible API")
    parser.add_argument("file", help="Audio file path")
    parser.add_argument("--language", default=None, help="Language code (default: auto-detect)")
    args = parser.parse_args()

    if not os.path.isfile(args.file):
        print(f"Error: File not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    try:
        result = transcribe(args.file, args.language)
        print(result.get("text", ""))
    except urllib.error.HTTPError as e:
        print(f"API Error: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
