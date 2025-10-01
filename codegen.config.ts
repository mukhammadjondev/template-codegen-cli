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
        select: `<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <FormSelect v-model="form.{{fullPath}}" :options="{{name}}Options" />
</el-form-item>`,
        textarea: `<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <el-input v-model="form.{{fullPath}}" type="textarea" :rows="3" />
</el-form-item>`,
        date: `<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <el-date-picker v-model="form.{{fullPath}}" type="date" />
</el-form-item>`,
        checkbox: `<el-form-item label="{{Name}}" prop="{{fullPath}}">
  <el-checkbox v-model="form.{{fullPath}}">{{Name}}</el-checkbox>
</el-form-item>`,
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

export default config;