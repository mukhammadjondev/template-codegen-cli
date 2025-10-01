# Smart Codegen

🚀 **Universal code generator with nested object support for dynamic form and component generation**

[![npm version](https://badge.fury.io/js/smart-codegen.svg)](https://www.npmjs.com/package/smart-codegen)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why Smart Codegen?

Stop writing repetitive boilerplate code. Smart Codegen generates complete, production-ready code from simple JSON input with support for deeply nested structures.

**Key Benefits:**

- **Save Hours**: Generate forms, components, and API routes in seconds
- **Consistent Code**: Maintain coding standards across your entire project
- **Nested Support**: Handle complex data structures with ease
- **Framework Agnostic**: Works with Vue, React, Angular, or any framework
- **Type Safe**: Full TypeScript support with auto-generated interfaces

## Features

✨ **Nested Object Support** - Handle complex data structures with unlimited nesting depth
⚡ **Dynamic Generation** - Auto-generate form fields, types, and interfaces
🎯 **Smart Placeholders** - Multiple naming conventions (camelCase, PascalCase, kebab-case, snake_case)
🔧 **Flexible Configuration** - JavaScript or TypeScript config files
👁️ **Dry Run Mode** - Preview changes before creating files
✅ **Template Validation** - Verify template structure before generation
🎨 **Auto Formatting** - Prettier integration for clean output
📝 **Interactive Editor** - Built-in JSON editor for complex structures

## Installation

```bash
npm install -g smart-codegen
```

## Quick Start

### 1. Initialize

```bash
codegen init --ts
```

This creates `codegen.config.ts` with example templates.

### 2. Create Template

Create `templates/vue-form/{{Name}}Form.vue`:

```vue
<template>
  <el-form :model="form" :rules="rules">
    {{body:formItems}}

    <el-form-item>
      <el-button type="primary" @click="handleSubmit">Submit</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
{{body:interfaces}}

interface {{Name}}Form {
{{body:types}}
}

const form = reactive<{{Name}}Form>({
{{body:defaultValues}}
});
</script>
```

### 3. Generate Code

#### Simple Generation

```bash
codegen generate vue-form user -b '{"name":"input","email":"input"}'
```

#### With Nested Objects

```bash
codegen generate vue-form user -b '{
  "name": "input",
  "email": "input",
  "address": {
    "city": "input",
    "country": "select"
  }
}'
```

#### Interactive Mode

```bash
codegen generate vue-form user
# Editor opens automatically for JSON input
```

### 4. Result

Generated `src/components/forms/UserForm.vue` with auto-formatted code:

```vue
<template>
  <el-form :model="form" :rules="rules">
    <el-form-item label="Name" prop="name">
      <FormInput v-model="form.name" />
    </el-form-item>

    <el-form-item label="Email" prop="email">
      <FormInput v-model="form.email" />
    </el-form-item>

    <el-form-item label="City" prop="address.city">
      <FormInput v-model="form.address.city" />
    </el-form-item>

    <el-form-item label="Country" prop="address.country">
      <FormSelect v-model="form.address.country" />
    </el-form-item>

    <el-form-item>
      <el-button type="primary" @click="handleSubmit">Submit</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
export interface Address {
  city: string;
  country: string;
}

interface UserForm {
  name: string;
  email: string;
  address: Address;
}

const form = reactive<UserForm>({
  name: '',
  email: '',
  address: {
    city: '',
    country: '',
  },
});
</script>
```

## Core Concepts

### Placeholders

Smart Codegen supports multiple placeholder types for flexible code generation:

#### Module Name Placeholders

| Placeholder       | Input       | Output       |
| ----------------- | ----------- | ------------ |
| `{{name}}`        | userProfile | userProfile  |
| `{{Name}}`        | userProfile | UserProfile  |
| `{{NAME}}`        | userProfile | USERPROFILE  |
| `{{name-kebab}}`  | userProfile | user-profile |
| `{{name_snake}}`  | userProfile | user_profile |
| `{{name.camel}}`  | UserProfile | userProfile  |
| `{{name.pascal}}` | userProfile | UserProfile  |

#### Body Placeholders

| Placeholder              | Description                 |
| ------------------------ | --------------------------- |
| `{{body:formItems}}`     | Generated form items        |
| `{{body:types}}`         | TypeScript type definitions |
| `{{body:interfaces}}`    | Nested interfaces           |
| `{{body:defaultValues}}` | Default values object       |
| `{{body:fields}}`        | Array of field names        |
| `{{body:zodSchema}}`     | Zod validation schema       |

#### Field Placeholders (in variable templates)

| Placeholder    | Description            | Example      |
| -------------- | ---------------------- | ------------ |
| `{{name}}`     | Field name             | city         |
| `{{Name}}`     | Capitalized field name | City         |
| `{{fullPath}}` | Full path with dots    | address.city |

### Configuration

Create `codegen.config.ts`:

```typescript
import { GeneratorConfig } from 'smart-codegen';

const config: GeneratorConfig = {
  templates: {
    'vue-form': {
      path: './templates/vue-form',
      description: 'Vue form with dynamic fields',
      output: './src/components/forms',
      needsBody: true,
      variables: {
        input: `<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <FormInput v-model="form.{{fullPath}}" />
</el-form-item>`,
        select: `<el:form-item label="{{Name}}" prop="{{fullPath}}">
  <FormSelect v-model="form.{{fullPath}}" :options="{{name}}Options" />
</el-form-item>`,
        textarea: `<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <el-input v-model="form.{{fullPath}}" type="textarea" :rows="3" />
</el-form-item>`,
      },
    },
  },
};

export default config;
```

## CLI Commands

### Generate

```bash
# Interactive mode
codegen generate

# Alias
cg generate

# Specify template and name
codegen generate vue-form user

# With JSON body
codegen generate vue-form user -b '{"name":"input","email":"input"}'

# Custom output directory
codegen generate vue-form user -o ./src/forms

# Dry run (preview only)
codegen generate vue-form user --dry-run

# All options combined
codegen generate vue-form user -o ./custom -b '{"name":"input"}' --dry-run
```

### List Templates

```bash
codegen list
# or
cg list
```

### Validate Template

```bash
codegen validate vue-form
```

### Initialize Config

```bash
# JavaScript config
codegen init

# TypeScript config
codegen init --ts
```

## Advanced Usage

### Nested Objects

Smart Codegen handles unlimited nesting depth:

```bash
codegen generate vue-form user -b '{
  "personal": {
    "firstName": "input",
    "lastName": "input",
    "bio": "textarea"
  },
  "contact": {
    "email": "input",
    "phone": "input",
    "address": {
      "street": "input",
      "city": "input",
      "country": "select"
    }
  }
}'
```

### Custom Field Types

Define your own field types in config:

```typescript
variables: {
  customField: `<el-form-item label="{{Name}}" prop="{{fullPath}}">
    <CustomComponent v-model="form.{{fullPath}}" />
  </el-form-item>`;
}
```

Then use it:

```bash
codegen generate vue-form user -b '{"customData": "customField"}'
```

### Body from File

Save reusable body structures:

```bash
# Create body file
echo '{
  "name": "input",
  "email": "input",
  "phone": "input"
}' > user-body.json

# Use it
codegen generate vue-form user -b "$(cat user-body.json)"
```

### Auto Formatting

Generated files are automatically formatted with Prettier for clean, consistent code.

## Best Practices

### 1. Use Descriptive Template Names

```typescript
templates: {
  'vue-admin-form': { /* ... */ },
  'react-dashboard-widget': { /* ... */ },
  'api-crud-route': { /* ... */ }
}
```

### 2. Organize Templates by Framework

```
templates/
├── vue/
│   ├── form/
│   └── component/
├── react/
│   ├── component/
│   └── hook/
└── api/
    └── route/
```

### 3. Use Dry Run for Testing

```bash
codegen generate vue-form test --dry-run -b '{"field":"input"}'
```

### 4. Version Control Your Templates

Commit `codegen.config.ts` and `templates/` to git so your team can use the same templates.

### 5. Create Reusable Body Files

```bash
mkdir body-templates
echo '{"name":"input","email":"input"}' > body-templates/user.json
echo '{"title":"input","price":"input"}' > body-templates/product.json
```

## Troubleshooting

### Config Not Found

```bash
# Make sure config file exists
ls codegen.config.*

# For TypeScript config, install ts-node
npm install -D ts-node
```

### Template Path Not Found

```bash
# Validate template
codegen validate template-name

# Check template path in config
```

### Nested Fields Not Working

Use `{{fullPath}}` instead of `{{name}}` in variable templates:

```typescript
// ❌ Wrong
variables: {
  input: `<input v-model="form.{{name}}" />`;
}

// ✅ Correct
variables: {
  input: `<input v-model="form.{{fullPath}}" />`;
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT © [Mukhammadjon Solijonov](https://github.com/mukhammadjondev)

## Support

- 📖 [Documentation](https://github.com/mukhammadjondev/smart-codegen#readme)
- 🐛 [Report Issues](https://github.com/mukhammadjondev/smart-codegen/issues)
- 💬 [Discussions](https://github.com/mukhammadjondev/smart-codegen/discussions)

---

Made with ❤️ by [Mukhammadjon Solijonov](https://github.com/mukhammadjondev)
