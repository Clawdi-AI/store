import { Command } from 'commander';
import chalk from 'chalk';
import { ReportService } from '../../core/report.js';
import { ConfigManager } from '../../core/config.js';
import { logger } from '../../lib/logger.js';
import path from 'path';

export const reportCommand = new Command('report')
  .description('Generate markdown reports from extracted feedback units')
  .option('--format <type>', 'Report format (only "md" supported currently)', 'md')
  .option('--since <date>', 'Include data since this date (YYYY-MM-DD)')
  .option('--weekly', 'Generate weekly report (Monday-Sunday boundaries)')
  .option('--week <date>', 'Specific week containing this date (YYYY-MM-DD, requires --weekly)')
  .option('--output <path>', 'Output file path (defaults to reports/{agent}-report-YYYY-MM-DD.md)')
  .option('--agent <type>', 'Agent type to generate report for (qa-extractor, sales-extractor)', 'qa-extractor')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.loadConfig();
      const reportService = new ReportService(config);

      // Handle weekly mode
      let sinceDate: Date | undefined;
      let weekInfo: { start: Date, end: Date, weekNumber: string, year: number } | undefined;

      // Validate that --week is only used with --weekly
      if (options.week && !options.weekly) {
        logger.error('--week option requires --weekly flag');
        process.exit(1);
      }

      if (options.weekly) {

        // Parse week reference date if provided
        let weekReferenceDate: Date | undefined;
        if (options.week) {
          weekReferenceDate = new Date(options.week);
          if (isNaN(weekReferenceDate.getTime())) {
            logger.error('Invalid week date format. Use YYYY-MM-DD');
            process.exit(1);
          }
        }

        // Calculate week boundaries
        weekInfo = ReportService.getWeekBounds(weekReferenceDate);
        sinceDate = weekInfo.start;

        console.log(chalk.blue(`📅 Generating weekly report for ${ReportService.formatWeekRange(weekInfo.start, weekInfo.end)} (${weekInfo.weekNumber})`));
      } else {
        // Parse since date if provided (non-weekly mode)
        if (options.since) {
          sinceDate = new Date(options.since);
          if (isNaN(sinceDate.getTime())) {
            logger.error('Invalid date format. Use YYYY-MM-DD');
            process.exit(1);
          }
        }
      }

      // Validate format
      if (options.format !== 'md') {
        logger.error('Only markdown format (--format md) is currently supported');
        process.exit(1);
      }

      logger.info(`Loading ${options.agent} units...`);
      const units = await reportService.loadUnits(options.agent, sinceDate);
      
      if (units.length === 0) {
        console.log(chalk.yellow(`No ${options.agent} units found. Run "fbtrack extract --agent ${options.agent}" first to generate data.`));
        return;
      }

      console.log(chalk.blue(`Found ${units.length} ${options.agent} units`));

      // Generate default output path if not provided
      let outputPath = options.output;
      if (!outputPath) {
        const reportsDir = path.join(process.cwd(), 'reports');
        const agentPrefix = options.agent.replace('-extractor', '');

        if (options.weekly && weekInfo) {
          // Weekly report filename: weekly-qa-report-2025-W37.md
          outputPath = path.join(reportsDir, `weekly-${agentPrefix}-report-${weekInfo.year}-${weekInfo.weekNumber}.md`);
        } else {
          // Regular report filename: qa-report-2025-09-16.md
          const reportDate = new Date().toISOString().split('T')[0];
          outputPath = path.join(reportsDir, `${agentPrefix}-report-${reportDate}.md`);
        }
      }

      // Generate report
      console.log(chalk.blue('Generating markdown report...'));
      await reportService.generateMarkdownReport(units, outputPath, options.agent, weekInfo);
      
      console.log(chalk.green(`✅ Report generated successfully: ${outputPath}`));
      
      // Show summary stats based on agent type
      let summaryStats = '';
      if (options.agent === 'qa-extractor') {
        const resolved = units.filter(u => u.solution?.resolved === true).length;
        const resolvedRate = Math.round((resolved / units.length) * 100);
        summaryStats = `   Total Q&A pairs: ${units.length}\n   Resolution rate: ${resolvedRate}%`;
      } else if (options.agent === 'sales-extractor') {
        const leadQualification = units.filter(u => u.insight_type === 'lead_qualification').length;
        const opportunities = units.filter(u => u.insight_type === 'opportunity_development').length;
        summaryStats = `   Total sales insights: ${units.length}\n   Lead qualification: ${leadQualification}\n   Opportunities: ${opportunities}`;
      } else {
        summaryStats = `   Total units: ${units.length}`;
      }
      
      const communities = new Set(units.map(u => u.chatTitle)).size;
      
      console.log(`\n📊 Report Summary:`);
      console.log(summaryStats);
      console.log(`   Communities: ${communities}`);
      console.log(`   Output: ${outputPath}`);

    } catch (error: any) {
      logger.error('Report generation failed', error);
      console.error(chalk.red('Report generation failed:'), error.message);
      process.exit(1);
    }
  });