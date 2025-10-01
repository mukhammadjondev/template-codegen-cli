export interface GeneratorConfig {
  templates: Record<string, TemplateConfig>;
  globalVariables?: Record<string, string>;
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
  fileNamePattern?: string; // Custom file naming pattern
  ignore?: string[]; // Ignore patterns
  hooks?: {
    beforeFileGenerate?: (
      file: string,
      content: string
    ) => Promise<string> | string;
    afterFileGenerate?: (file: string) => Promise<void> | void;
  };
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

export interface GenerateOptions {
  output?: string;
  body?: string;
  dryRun?: boolean;
}

export interface InitOptions {
  ts?: boolean;
  example?: boolean;
}

// Field metadata for better type safety
export interface FieldMetadata {
  name: string;
  type: string;
  fullPath: string;
  isNested: boolean;
  parent?: string;
  validation?: ValidationRule[];
}

export interface ValidationRule {
  type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message?: string;
}
