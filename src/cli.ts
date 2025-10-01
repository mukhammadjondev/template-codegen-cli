#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { Generator } from './generator';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

const c = {
  red: (text: string) => `${colors.red}${text}${colors.reset}`,
  green: (text: string) => `${colors.green}${text}${colors.reset}`,
  yellow: (text: string) => `${colors.yellow}${text}${colors.reset}`,
  blue: (text: string) => `${colors.blue}${text}${colors.reset}`,
  gray: (text: string) => `${colors.gray}${text}${colors.reset}`,
};

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function select(question: string, choices: string[]): Promise<string> {
  console.log(c.blue(question));
  choices.forEach((choice, i) => {
    console.log(c.gray(`  ${i + 1}. ${choice}`));
  });

  const answer = await prompt('Enter number: ');
  const index = parseInt(answer) - 1;

  if (index >= 0 && index < choices.length) {
    return choices[index];
  }

  console.log(c.red('Invalid selection'));
  return select(question, choices);
}

async function confirm(question: string): Promise<boolean> {
  const answer = await prompt(`${question} (y/n): `);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

interface ParsedArgs {
  command?: string;
  args: string[];
  options: Record<string, string | boolean>;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const parsed: ParsedArgs = { args: [], options: {} };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('-')) {
        parsed.options[key] = nextArg;
        i++;
      } else {
        parsed.options[key] = true;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('-')) {
        parsed.options[key] = nextArg;
        i++;
      } else {
        parsed.options[key] = true;
      }
    } else {
      if (!parsed.command) {
        parsed.command = arg;
      } else {
        parsed.args.push(arg);
      }
    }
  }

  return parsed;
}

// Command handlers
async function handleGenerate(args: ParsedArgs) {
  try {
    const generator = new Generator();

    try {
      await generator.loadConfig();
    } catch (configError) {
      console.log(c.red('\n❌ Configuration Error:'));
      console.log(c.red((configError as Error).message));
      console.log(
        c.yellow('\nTip: Run "codegen init" to create a config file')
      );
      process.exit(1);
    }

    const templates = generator.getTemplates();

    if (templates.length === 0) {
      console.log(c.red('No templates found. Run "codegen init" first.'));
      return;
    }

    // Get template
    let template = args.args[0];
    if (!template) {
      template = await select('Select a template:', templates);
    }

    // Get name
    let name = args.args[1];
    if (!name) {
      name = await prompt('Enter module name: ');
      if (!name) {
        console.log(c.red('Module name is required'));
        return;
      }
    }

    // Validate template
    if (!generator.hasTemplate(template)) {
      console.log(c.red(`\nTemplate "${template}" not found!`));
      console.log(c.yellow('\nAvailable templates:'));
      templates.forEach(t => console.log(c.gray(`  - ${t}`)));
      process.exit(1);
    }

    const templateConfig = generator.getTemplate(template);

    // Handle body object
    let bodyObject: Record<string, any> | undefined;
    if (templateConfig.needsBody) {
      const bodyString =
        (args.options.b as string) || (args.options.body as string);

      if (bodyString) {
        try {
          bodyObject = JSON.parse(bodyString);
        } catch {
          console.log(c.red('Invalid JSON in --body option'));
          process.exit(1);
        }
      } else {
        console.log(c.blue('\nThis template requires body fields.'));
        console.log(c.gray('Examples:'));
        console.log(c.gray('  Simple: {"name": "input", "email": "input"}'));
        console.log(
          c.gray('  Nested: {"name": "input", "address": {"city": "input"}}\n')
        );

        const bodyInput = await prompt('Enter body object (JSON): ');
        try {
          bodyObject = JSON.parse(bodyInput);
        } catch {
          console.log(c.red('Invalid JSON'));
          process.exit(1);
        }
      }
    }

    const outputPath =
      (args.options.o as string) ||
      (args.options.output as string) ||
      templateConfig.output;
    const isDryRun = args.options['dry-run'] === true;
    const shouldFormat = args.options['no-format'] !== true;

    console.log(c.blue(`\nGenerating ${template} with name "${name}"...`));
    if (outputPath) console.log(c.gray(`Output: ${outputPath}`));
    if (bodyObject)
      console.log(c.gray(`Fields: ${formatBodyPreview(bodyObject)}\n`));

    if (isDryRun) {
      console.log(c.yellow('\n⚠️  DRY RUN MODE - No files will be created\n'));
    }

    const result = await generator.generate(
      template,
      name,
      outputPath,
      bodyObject,
      isDryRun,
      shouldFormat
    );

    if (result.success) {
      console.log(c.green('\n✅ Generation completed successfully!\n'));
      result.files.forEach(file => {
        const fullPath = path.join(outputPath || './src', file);
        console.log(c.green(`  ✓ ${fullPath}`));
      });

      if (isDryRun) {
        console.log(c.yellow('\n⚠️  No files were created (dry run mode)\n'));
      } else if (shouldFormat) {
        console.log(c.gray('\n✨ Files formatted\n'));
      }
    } else {
      console.log(c.red('\n❌ Generation failed:'));
      result.errors.forEach(error => console.log(c.red(`  ✗ ${error}`)));
      process.exit(1);
    }
  } catch (error) {
    console.error(c.red('Error:'), (error as Error).message);
    process.exit(1);
  }
}

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

async function handleList() {
  try {
    const generator = new Generator();
    await generator.loadConfig();

    const templates = generator.getTemplates();

    if (templates.length === 0) {
      console.log(c.yellow('No templates found. Run "codegen init" first.'));
      return;
    }

    console.log(c.blue('\nAvailable templates:\n'));
    templates.forEach(templateName => {
      const template = generator.getTemplate(templateName);
      console.log(c.green(`  • ${templateName}`));
      if (template.description) {
        console.log(c.gray(`    ${template.description}`));
      }
      if (template.output) {
        console.log(c.gray(`    Output: ${template.output}`));
      }
      if (template.needsBody) {
        console.log(c.yellow(`    Requires body input`));
      }
      if (template.variables) {
        console.log(
          c.gray(
            `    Field types: ${Object.keys(template.variables).join(', ')}`
          )
        );
      }
    });
    console.log();
  } catch (error) {
    console.error(c.red('Error:'), (error as Error).message);
    process.exit(1);
  }
}

async function handleValidate(templateName: string) {
  try {
    const generator = new Generator();
    await generator.loadConfig();

    if (!generator.hasTemplate(templateName)) {
      console.log(c.red(`Template "${templateName}" not found`));
      process.exit(1);
    }

    const template = generator.getTemplate(templateName);
    console.log(c.blue(`\nValidating template: ${templateName}\n`));

    const exists = fs.existsSync(template.path);
    console.log(
      exists
        ? c.green(`✓ Template path exists: ${template.path}`)
        : c.red(`✗ Template path not found: ${template.path}`)
    );

    if (!exists) {
      process.exit(1);
    }

    console.log(c.green('\n✅ Template is valid\n'));
  } catch (error) {
    console.error(c.red('Error:'), (error as Error).message);
    process.exit(1);
  }
}

async function handleInit() {
  const configFile = 'codegen.config.js';

  if (fs.existsSync(configFile)) {
    const overwrite = await confirm(`${configFile} already exists. Overwrite?`);
    if (!overwrite) {
      console.log(c.yellow('Cancelled.'));
      return;
    }
  }

  const configContent = `module.exports = {
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

  fs.writeFileSync(configFile, configContent);
  console.log(c.green(`✅ Configuration file created: ${configFile}`));

  console.log(c.blue('\nNext steps:'));
  console.log('1. Create template directories');
  console.log('2. Add template files with placeholders');
  console.log('3. Run "codegen list" to see available templates');
  console.log('4. Run "codegen generate <template> <name>"');
}

function showHelp() {
  console.log(`
${c.blue('Template Codegen CLI')} - Universal code generator

${c.yellow('Usage:')}
  codegen <command> [options]

${c.yellow('Commands:')}
  generate, g [template] [name]  Generate code from template
    Options:
      -o, --output <path>        Output directory
      -b, --body <json>          Body object as JSON
      --dry-run                  Preview without creating files
      --no-format                Skip formatting

  list, ls                       List available templates
  validate <template>            Validate template structure
  init                           Initialize configuration
  help, --help, -h              Show this help

${c.yellow('Examples:')}
  codegen init
  codegen generate vue-form user
  codegen generate vue-form user -b '{"name":"input","email":"input"}'
  codegen list
`);
}

// Main
async function main() {
  const parsed = parseArgs();

  if (!parsed.command || parsed.options.help || parsed.options.h) {
    showHelp();
    return;
  }

  const command = parsed.command;

  switch (command) {
    case 'generate':
    case 'g':
      await handleGenerate(parsed);
      break;

    case 'list':
    case 'ls':
      await handleList();
      break;

    case 'validate':
      if (!parsed.args[0]) {
        console.log(c.red('Template name required'));
        process.exit(1);
      }
      await handleValidate(parsed.args[0]);
      break;

    case 'init':
      await handleInit();
      break;

    case 'help':
      showHelp();
      break;

    default:
      console.log(c.red(`Unknown command: ${command}`));
      showHelp();
      process.exit(1);
  }
}

main().catch(error => {
  console.error(c.red('Fatal error:'), error.message);
  process.exit(1);
});
