import * as fs from 'fs-extra';
import * as path from 'path';
import * as glob from 'glob';
import * as prettier from 'prettier';
import { GeneratorConfig, TemplateConfig, GenerationResult } from './types';

export class Generator {
  private config: GeneratorConfig = { templates: {} };

  async loadConfig(configPath?: string): Promise<void> {
    const possiblePaths = configPath
      ? [configPath]
      : ['./codegen.config.ts', './codegen.config.js', './codegen.config.json'];

    for (const tryPath of possiblePaths) {
      if (await fs.pathExists(tryPath)) {
        const resolvedPath = path.resolve(tryPath);

        if (tryPath.endsWith('.ts')) {
          try {
            require('ts-node/register');
          } catch (e) {
            console.warn(
              'ts-node not found, install it: npm install -D ts-node'
            );
            continue;
          }
        }

        try {
          delete require.cache[resolvedPath];
          const loaded = require(resolvedPath);
          this.config = loaded.default || loaded;

          if (
            !this.config.templates ||
            typeof this.config.templates !== 'object'
          ) {
            throw new Error('Config must have a "templates" object');
          }

          console.log(`✓ Config loaded from: ${tryPath}`);
          return;
        } catch (error) {
          throw new Error(
            `Failed to load config from ${tryPath}: ${(error as Error).message}`
          );
        }
      }
    }

    throw new Error(
      'Config file not found. Run "codegen init" first.\n' +
        'Looking for: codegen.config.ts, codegen.config.js, or codegen.config.json'
    );
  }

  getTemplates(): string[] {
    return Object.keys(this.config.templates);
  }

  hasTemplate(name: string): boolean {
    return name in this.config.templates;
  }

  getTemplate(name: string): TemplateConfig {
    if (!this.hasTemplate(name)) {
      throw new Error(
        `Template "${name}" not found. Available templates: ${this.getTemplates().join(
          ', '
        )}`
      );
    }
    return this.config.templates[name];
  }

  async generate(
    templateName: string,
    moduleName: string,
    outputPath?: string,
    bodyObject?: Record<string, any>,
    isDryRun: boolean = false,
    shouldFormat: boolean = true
  ): Promise<GenerationResult> {
    const result: GenerationResult = {
      success: true,
      files: [],
      errors: [],
      warnings: [],
    };

    try {
      if (!this.hasTemplate(templateName)) {
        throw new Error(`Template "${templateName}" not found`);
      }

      const template = this.config.templates[templateName];
      const templatePath = template.path;

      const finalOutputPath = outputPath || template.output || './src';

      if (!(await fs.pathExists(templatePath))) {
        throw new Error(`Template path not found: ${templatePath}`);
      }

      if (this.config.hooks?.beforeGenerate) {
        await this.config.hooks.beforeGenerate({
          templateName,
          moduleName,
          outputPath: finalOutputPath,
          bodyObject,
        });
      }

      let bodyReplacements: Record<string, string> = {};
      if (bodyObject && template.variables) {
        bodyReplacements = this.generateBodyReplacements(
          bodyObject,
          template.variables
        );
      }

      const pattern = path.join(templatePath, '**/*');
      const files = glob.sync(pattern, { nodir: true, dot: true });

      for (const file of files) {
        const relativePath = path.relative(templatePath, file);

        if (
          template.ignore &&
          this.shouldIgnore(relativePath, template.ignore)
        ) {
          result.warnings?.push(`Skipped ignored file: ${relativePath}`);
          continue;
        }

        const content = await fs.readFile(file, 'utf8');

        let processedPath = this.replacePlaceholders(relativePath, moduleName);
        let processedContent = this.replacePlaceholders(content, moduleName);

        if (template.hooks?.beforeFileGenerate) {
          processedContent = await template.hooks.beforeFileGenerate(
            processedPath,
            processedContent
          );
        }

        if (Object.keys(bodyReplacements).length > 0) {
          processedContent = this.replaceBodyPlaceholders(
            processedContent,
            bodyReplacements
          );
        }

        // Format with Prettier if enabled
        if (shouldFormat && !isDryRun) {
          try {
            processedContent = await this.formatCode(
              processedContent,
              processedPath
            );
          } catch (formatError) {
            result.warnings?.push(
              `Could not format ${processedPath}: ${
                (formatError as Error).message
              }`
            );
          }
        }

        const outputFile = path.join(finalOutputPath, processedPath);

        if (!isDryRun) {
          await fs.ensureDir(path.dirname(outputFile));
          await fs.writeFile(outputFile, processedContent);

          if (template.hooks?.afterFileGenerate) {
            await template.hooks.afterFileGenerate(outputFile);
          }
        }

        result.files.push(processedPath);
      }

      if (this.config.hooks?.afterGenerate) {
        await this.config.hooks.afterGenerate(
          {
            templateName,
            moduleName,
            outputPath: finalOutputPath,
            bodyObject,
          },
          result
        );
      }
    } catch (error) {
      result.success = false;
      result.errors.push((error as Error).message);
    }

    return result;
  }

  private async formatCode(content: string, filePath: string): Promise<string> {
    const ext = path.extname(filePath);

    // Determine parser based on file extension
    let parser: prettier.BuiltInParserName | undefined;

    switch (ext) {
      case '.vue':
        parser = 'vue';
        break;
      case '.ts':
      case '.tsx':
        parser = 'typescript';
        break;
      case '.js':
      case '.jsx':
        parser = 'babel';
        break;
      case '.json':
        parser = 'json';
        break;
      case '.css':
      case '.scss':
        parser = 'css';
        break;
      case '.html':
        parser = 'html';
        break;
      case '.md':
        parser = 'markdown';
        break;
      default:
        // Don't format unknown file types
        return content;
    }

    try {
      return prettier.format(content, {
        parser,
        semi: true,
        singleQuote: true,
        tabWidth: 2,
        trailingComma: 'es5',
        printWidth: 80,
        arrowParens: 'avoid',
      });
    } catch (error) {
      // If formatting fails, return original content
      return content;
    }
  }

  private shouldIgnore(filePath: string, ignorePatterns: string[]): boolean {
    return ignorePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(filePath);
    });
  }

  private generateBodyReplacements(
    bodyObject: Record<string, any>,
    variableTemplates: Record<string, string>
  ): Record<string, string> {
    const replacements: Record<string, string> = {
      formItems: '',
      types: '',
      defaultValues: '',
      fields: '',
      interfaces: '',
      zodSchema: '',
    };

    const allFields: string[] = [];

    const processField = (key: string, value: any, prefix = ''): void => {
      const fullPath = prefix ? `${prefix}.${key}` : key;

      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const interfaceName = this.capitalize(key);
        let interfaceContent = `export interface ${interfaceName} {\n`;

        Object.entries(value).forEach(([nestedKey, nestedValue]) => {
          if (
            typeof nestedValue === 'object' &&
            nestedValue !== null &&
            !Array.isArray(nestedValue)
          ) {
            interfaceContent += `  ${nestedKey}: ${this.capitalize(
              nestedKey
            )};\n`;
          } else {
            interfaceContent += `  ${nestedKey}: string;\n`;
          }
        });

        interfaceContent += `}\n\n`;
        replacements.interfaces += interfaceContent;

        replacements.types += `  ${key}: ${interfaceName};\n`;

        const nestedDefaults = this.generateNestedDefaults(value);
        replacements.defaultValues += `  ${key}: ${nestedDefaults},\n`;

        const nestedZodSchema = this.generateNestedZodSchema(value);
        replacements.zodSchema += `  ${key}: z.object(${nestedZodSchema}),\n`;

        Object.entries(value).forEach(([nestedKey, nestedValue]) => {
          processField(nestedKey, nestedValue, fullPath);
        });
      } else {
        const fieldType = value as string;
        const template = variableTemplates[fieldType];

        if (template) {
          const formItem = template
            .replace(/\{\{name\}\}/g, key)
            .replace(/\{\{Name\}\}/g, this.capitalize(key))
            .replace(/\{\{fullPath\}\}/g, fullPath);
          replacements.formItems += formItem + '\n';
        }

        if (!prefix) {
          replacements.types += `  ${key}: string;\n`;
          replacements.defaultValues += `  ${key}: '',\n`;
        }

        allFields.push(`'${fullPath}'`);
      }
    };

    Object.entries(bodyObject).forEach(([key, value]) => {
      processField(key, value);
    });

    replacements.fields = allFields.join(', ');
    replacements.defaultValues = replacements.defaultValues
      .trim()
      .replace(/,$/, '');

    return replacements;
  }

  private generateNestedDefaults(obj: Record<string, any>): string {
    let result = '{\n';
    Object.entries(obj).forEach(([key, value]) => {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        result += `    ${key}: ${this.generateNestedDefaults(value)},\n`;
      } else {
        result += `    ${key}: '',\n`;
      }
    });
    result += '  }';
    return result;
  }

  private generateNestedZodSchema(obj: Record<string, any>): string {
    let result = '{\n';
    Object.entries(obj).forEach(([key, value]) => {
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        result += `    ${key}: z.object(${this.generateNestedZodSchema(
          value
        )}),\n`;
      } else {
        result += `    ${key}: z.string(),\n`;
      }
    });
    result += '  }';
    return result;
  }

  private replaceBodyPlaceholders(
    content: string,
    replacements: Record<string, string>
  ): string {
    let result = content;
    Object.entries(replacements).forEach(([key, value]) => {
      const placeholders = [
        `{{body:${key}}}`,
        `{{body: ${key}}}`,
        `{{ body:${key} }}`,
        `{{ body: ${key} }}`,
      ];

      placeholders.forEach(placeholder => {
        result = result.replace(
          new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          value
        );
      });
    });
    return result;
  }

  private replacePlaceholders(text: string, moduleName: string): string {
    return text
      .replace(/\{\{name\}\}/g, moduleName)
      .replace(/\{\{Name\}\}/g, this.capitalize(moduleName))
      .replace(/\{\{NAME\}\}/g, moduleName.toUpperCase())
      .replace(/\{\{name-kebab\}\}/g, this.toKebabCase(moduleName))
      .replace(/\{\{name_snake\}\}/g, this.toSnakeCase(moduleName))
      .replace(/\{\{name\.camel\}\}/g, this.toCamelCase(moduleName))
      .replace(/\{\{name\.pascal\}\}/g, this.capitalize(moduleName));
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private toKebabCase(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  private toSnakeCase(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  }

  private toCamelCase(str: string): string {
    return str.charAt(0).toLowerCase() + str.slice(1);
  }
}
