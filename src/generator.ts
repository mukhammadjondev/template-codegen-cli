import * as fs from 'fs';
import * as path from 'path';

export interface GeneratorConfig {
  templates: Record<string, TemplateConfig>;
  hooks?: {
    beforeGenerate?: (context: GenerationContext) => Promise<void> | void;
    afterGenerate?: (
      context: GenerationContext,
      result: GenerationResult
    ) => Promise<void> | void;
  };
}

export interface TemplateConfig {
  path: string;
  description?: string;
  output?: string;
  needsBody?: boolean;
  variables?: Record<string, string>;
  ignore?: string[];
}

export interface GenerationResult {
  success: boolean;
  files: string[];
  errors: string[];
  warnings?: string[];
}

export interface GenerationContext {
  templateName: string;
  moduleName: string;
  outputPath: string;
  bodyObject?: Record<string, any>;
}

export class Generator {
  private config: GeneratorConfig = { templates: {} };

  async loadConfig(configPath?: string): Promise<void> {
    const possiblePaths = configPath
      ? [configPath]
      : ['./codegen.config.js', './codegen.config.json'];

    for (const tryPath of possiblePaths) {
      if (fs.existsSync(tryPath)) {
        const resolvedPath = path.resolve(tryPath);

        try {
          if (tryPath.endsWith('.json')) {
            const content = fs.readFileSync(resolvedPath, 'utf8');
            this.config = JSON.parse(content);
          } else {
            delete require.cache[resolvedPath];

            const { createRequire } = require('module');
            const requireFromPath = createRequire(resolvedPath);

            try {
              const loaded = requireFromPath(resolvedPath);
              this.config = loaded.default || loaded;
            } catch (requireError) {
              // Fallback: try reading as plain JavaScript and eval
              const content = fs.readFileSync(resolvedPath, 'utf8');

              // Create a module context
              const moduleExports: any = {};
              const moduleObj = { exports: moduleExports };

              // Wrap in function to provide module context
              const wrapped = `(function(module, exports, require) { ${content} })(moduleObj, moduleObj.exports, require);`;

              try {
                eval(wrapped);
                this.config = moduleObj.exports.default || moduleObj.exports;
              } catch {
                throw requireError;
              }
            }
          }

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
        'Looking for: codegen.config.cjs, codegen.config.js, or codegen.config.json'
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
        `Template "${name}" not found. Available: ${this.getTemplates().join(', ')}`
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
      const template = this.getTemplate(templateName);
      const templatePath = template.path;
      const finalOutputPath = outputPath || template.output || './src';

      if (!fs.existsSync(templatePath)) {
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

      const files = this.getAllFiles(templatePath);

      for (const file of files) {
        const relativePath = path.relative(templatePath, file);

        if (
          template.ignore &&
          this.shouldIgnore(relativePath, template.ignore)
        ) {
          result.warnings?.push(`Skipped: ${relativePath}`);
          continue;
        }

        let content = fs.readFileSync(file, 'utf8');
        let processedPath = this.replacePlaceholders(relativePath, moduleName);
        let processedContent = this.replacePlaceholders(content, moduleName);

        if (Object.keys(bodyReplacements).length > 0) {
          processedContent = this.replaceBodyPlaceholders(
            processedContent,
            bodyReplacements
          );
        }

        if (shouldFormat && !isDryRun) {
          try {
            processedContent = this.formatCode(processedContent, processedPath);
          } catch (e) {
            result.warnings?.push(`Format failed: ${processedPath}`);
          }
        }

        const outputFile = path.join(finalOutputPath, processedPath);

        if (!isDryRun) {
          this.ensureDir(path.dirname(outputFile));
          fs.writeFileSync(outputFile, processedContent);
        }

        result.files.push(processedPath);
      }

      if (this.config.hooks?.afterGenerate) {
        await this.config.hooks.afterGenerate(
          { templateName, moduleName, outputPath: finalOutputPath, bodyObject },
          result
        );
      }
    } catch (error) {
      result.success = false;
      result.errors.push((error as Error).message);
    }

    return result;
  }

  private getAllFiles(dir: string): string[] {
    const files: string[] = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...this.getAllFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private formatCode(content: string, filePath: string): string {
    const ext = path.extname(filePath);

    // Simple formatting for common file types
    if (['.js', '.ts', '.jsx', '.tsx', '.vue', '.css', '.scss'].includes(ext)) {
      // Basic formatting: fix indentation and line endings
      return (
        content
          .split('\n')
          .map(line => line.trimEnd())
          .join('\n')
          .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
          .trim() + '\n'
      );
    }

    return content;
  }

  private shouldIgnore(filePath: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
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
            interfaceContent += `  ${nestedKey}: ${this.capitalize(nestedKey)};\n`;
          } else {
            interfaceContent += `  ${nestedKey}: string;\n`;
          }
        });

        interfaceContent += `}\n\n`;
        replacements.interfaces += interfaceContent;
        replacements.types += `  ${key}: ${interfaceName};\n`;

        const nestedDefaults = this.generateNestedDefaults(value);
        replacements.defaultValues += `  ${key}: ${nestedDefaults},\n`;

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

  private replaceBodyPlaceholders(
    content: string,
    replacements: Record<string, string>
  ): string {
    let result = content;
    Object.entries(replacements).forEach(([key, value]) => {
      const patterns = [
        `{{body:${key}}}`,
        `{{body: ${key}}}`,
        `{{ body:${key} }}`,
        `{{ body: ${key} }}`,
      ];

      patterns.forEach(pattern => {
        result = result.replace(
          new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
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
