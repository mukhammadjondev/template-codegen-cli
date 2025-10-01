#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs-extra';
import * as inquirer from 'inquirer';
import chalk from 'chalk';
import { Command } from 'commander';
import { Generator } from './generator';
import { GenerateOptions, InitOptions } from './types';

const program = new Command();

program
  .name('codegen')
  .description('Smart Codegen - Universal code generator')
  .version('1.0.0');

program
  .command('generate [template] [name]')
  .alias('g')
  .description('Generate code from template')
  .option('-o, --output <path>', 'Output directory')
  .option('-b, --body <json>', 'Body object as JSON string')
  .option('--dry-run', 'Preview what will be generated without creating files')
  .option('--no-format', 'Skip Prettier formatting')
  .action(
    async (
      template: string | undefined,
      name: string | undefined,
      options: GenerateOptions & { noFormat?: boolean }
    ) => {
      try {
        const generator = new Generator();

        try {
          await generator.loadConfig();
        } catch (configError) {
          console.log(chalk.red('\n❌ Configuration Error:'));
          console.log(chalk.red((configError as Error).message));
          console.log(
            chalk.yellow('\nTip: Run "codegen init" to create a config file')
          );
          process.exit(1);
        }

        const templates = generator.getTemplates();

        if (templates.length === 0) {
          console.log(
            chalk.red('No templates found. Run "codegen init" first.')
          );
          return;
        }

        // Template selection
        if (!template) {
          const answers = await inquirer.prompt<{ selectedTemplate: string }>([
            {
              type: 'list',
              name: 'selectedTemplate',
              message: 'Select a template:',
              choices: templates,
            },
          ]);
          template = answers.selectedTemplate;
        }

        // Name input
        if (!name) {
          const answers = await inquirer.prompt<{ moduleName: string }>([
            {
              type: 'input',
              name: 'moduleName',
              message: 'Enter module name:',
              validate: (input: string) =>
                input.trim() ? true : 'Module name is required',
            },
          ]);
          name = answers.moduleName;
        }

        // Template validation
        if (!generator.hasTemplate(template)) {
          console.log(chalk.red(`\nTemplate "${template}" not found!`));
          console.log(chalk.yellow('\nAvailable templates:'));
          const availableTemplates = generator.getTemplates();
          availableTemplates.forEach(t => {
            console.log(chalk.gray(`  - ${t}`));
          });
          process.exit(1);
        }

        const templateConfig = generator.getTemplate(template);

        // Body object handling
        let bodyObject: Record<string, any> | undefined;
        if (templateConfig.needsBody) {
          if (options.body) {
            try {
              bodyObject = JSON.parse(options.body);
            } catch {
              console.log(chalk.red('Invalid JSON in --body option'));
              process.exit(1);
            }
          } else {
            console.log(chalk.blue('\nThis template requires body fields.'));
            console.log(chalk.gray('Examples:'));
            console.log(
              chalk.gray('  Simple: {"name": "input", "email": "input"}')
            );
            console.log(
              chalk.gray(
                '  Nested: {"name": "input", "address": {"city": "input", "country": "select"}}\n'
              )
            );

            const editorAnswer = await inquirer.prompt<{ bodyInput: string }>([
              {
                type: 'editor',
                name: 'bodyInput',
                message: 'Enter body object (JSON):',
                default: '{\n  "name": "input",\n  "email": "input"\n}',
                validate: (input: string) => {
                  try {
                    JSON.parse(input);
                    return true;
                  } catch {
                    return 'Please enter valid JSON';
                  }
                },
              },
            ]);
            bodyObject = JSON.parse(editorAnswer.bodyInput);
          }
        }

        const outputPath = options.output || templateConfig.output;

        console.log(
          chalk.blue(`\nGenerating ${template} with name "${name}"...`)
        );
        if (outputPath) {
          console.log(chalk.gray(`Output: ${outputPath}`));
        }
        if (bodyObject) {
          console.log(chalk.gray(`Fields: ${formatBodyPreview(bodyObject)}\n`));
        }

        if (options.dryRun) {
          console.log(
            chalk.yellow('\n⚠️  DRY RUN MODE - No files will be created\n')
          );
        }

        const result = await generator.generate(
          template,
          name,
          options.output,
          bodyObject,
          options.dryRun || false,
          !options.noFormat
        );

        if (result.success) {
          console.log(chalk.green('\n✅ Generation completed successfully!\n'));
          result.files.forEach(file => {
            const fullPath = path.join(outputPath || './src', file);
            console.log(chalk.green(`  ✓ ${fullPath}`));
          });

          if (options.dryRun) {
            console.log(
              chalk.yellow('\n⚠️  No files were created (dry run mode)\n')
            );
          } else if (!options.noFormat) {
            console.log(chalk.gray('\n✨ Files formatted with Prettier\n'));
          }
        } else {
          console.log(chalk.red('\n❌ Generation failed:'));
          result.errors.forEach(error => {
            console.log(chalk.red(`  ✗ ${error}`));
          });
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Error:'), (error as Error).message);
        process.exit(1);
      }
    }
  );

function formatBodyPreview(obj: Record<string, any>, prefix = ''): string {
  const fields: string[] = [];

  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      fields.push(`${prefix}${key} { ${formatBodyPreview(value, '')} }`);
    } else {
      fields.push(`${prefix}${key}`);
    }
  });

  return fields.join(', ');
}

program
  .command('list')
  .alias('ls')
  .description('List available templates')
  .action(async () => {
    try {
      const generator = new Generator();
      await generator.loadConfig();

      const templates = generator.getTemplates();

      if (templates.length === 0) {
        console.log(
          chalk.yellow('No templates found. Run "codegen init" first.')
        );
        return;
      }

      console.log(chalk.blue('\nAvailable templates:\n'));
      templates.forEach(templateName => {
        const template = generator.getTemplate(templateName);
        console.log(chalk.green(`  • ${templateName}`));
        if (template.description) {
          console.log(chalk.gray(`    ${template.description}`));
        }
        if (template.output) {
          console.log(chalk.gray(`    Output: ${template.output}`));
        }
        if (template.needsBody) {
          console.log(chalk.yellow(`    Requires body input`));
        }
        if (template.variables) {
          console.log(
            chalk.gray(
              `    Supported field types: ${Object.keys(
                template.variables
              ).join(', ')}`
            )
          );
        }
      });
      console.log();
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('validate <template>')
  .description('Validate template structure')
  .action(async (templateName: string) => {
    try {
      const generator = new Generator();
      await generator.loadConfig();

      if (!generator.hasTemplate(templateName)) {
        console.log(chalk.red(`Template "${templateName}" not found`));
        process.exit(1);
      }

      const template = generator.getTemplate(templateName);
      console.log(chalk.blue(`\nValidating template: ${templateName}\n`));

      const exists = await fs.pathExists(template.path);
      console.log(
        exists
          ? chalk.green(`✓ Template path exists: ${template.path}`)
          : chalk.red(`✗ Template path not found: ${template.path}`)
      );

      if (!exists) {
        process.exit(1);
      }

      const glob = require('glob');
      const files = glob.sync(path.join(template.path, '**/*'), {
        nodir: true,
        dot: true,
      });
      console.log(chalk.green(`✓ Found ${files.length} template files`));

      if (template.needsBody) {
        if (template.variables && Object.keys(template.variables).length > 0) {
          console.log(
            chalk.green(
              `✓ Variables defined: ${Object.keys(template.variables).join(
                ', '
              )}`
            )
          );
        } else {
          console.log(
            chalk.yellow('⚠  Template needs body but no variables defined')
          );
        }
      }

      console.log(chalk.green('\n✅ Template is valid\n'));
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize configuration')
  .option('--ts', 'Create TypeScript config')
  .action(async (options: InitOptions) => {
    const useTypeScript = options.ts === true;
    const configFile = useTypeScript
      ? 'codegen.config.ts'
      : 'codegen.config.js';

    if (await fs.pathExists(configFile)) {
      const answers = await inquirer.prompt<{ overwrite: boolean }>([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `${configFile} already exists. Overwrite?`,
          default: false,
        },
      ]);

      if (!answers.overwrite) {
        console.log(chalk.yellow('Cancelled.'));
        return;
      }
    }

    const configContent = useTypeScript
      ? `import { GeneratorConfig } from 'smart-codegen';

const config: GeneratorConfig = {
  templates: {
    'vue-form': {
      path: './templates/vue-form',
      description: 'Vue form with dynamic fields',
      output: './src/components/forms',
      needsBody: true,
      variables: {
        input: \`<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <FormInput v-model="form.{{fullPath}}" />
</el-form-item>\`,
        select: \`<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <FormSelect v-model="form.{{fullPath}}" :options="{{name}}Options" />
</el-form-item>\`,
        textarea: \`<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <el-input v-model="form.{{fullPath}}" type="textarea" :rows="3" />
</el-form-item>\`,
        date: \`<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <el-date-picker v-model="form.{{fullPath}}" type="date" />
</el-form-item>\`,
        checkbox: \`<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <el-checkbox v-model="form.{{fullPath}}">{{Name}}</el-checkbox>
</el-form-item>\`,
      }
    },
    'react-component': {
      path: './templates/react-component',
      description: 'React functional component',
      output: './src/components'
    },
    'api-route': {
      path: './templates/api-route',
      description: 'API route handler',
      output: './src/api/routes'
    }
  }
};

export default config;`
      : `module.exports = {
  templates: {
    'vue-form': {
      path: './templates/vue-form',
      description: 'Vue form with dynamic fields',
      output: './src/components/forms',
      needsBody: true,
      variables: {
        input: \`<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <FormInput v-model="form.{{fullPath}}" />
</el-form-item>\`,
        select: \`<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <FormSelect v-model="form.{{fullPath}}" :options="{{name}}Options" />
</el-form-item>\`,
        textarea: \`<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <el-input v-model="form.{{fullPath}}" type="textarea" :rows="3" />
</el-form-item>\`,
      }
    },
    'react-component': {
      path: './templates/react-component',
      description: 'React functional component',
      output: './src/components'
    }
  }
};`;

    await fs.writeFile(configFile, configContent);
    console.log(chalk.green(`✅ Configuration file created: ${configFile}`));

    if (useTypeScript) {
      console.log(chalk.blue('\nNote: Make sure ts-node is installed:'));
      console.log(chalk.gray('  npm install -D ts-node'));
    }

    console.log(chalk.blue('\nNext steps:'));
    console.log('1. Create template directories');
    console.log('2. Add template files with placeholders');
    console.log('3. Run "codegen list" to see available templates');
    console.log('4. Run "codegen generate <template> <name>"');
  });

program.parse();
