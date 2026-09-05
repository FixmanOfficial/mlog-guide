import {defineConfig} from 'vite'

export default defineConfig({
    // Атлас иконок лежит в editor: он общий, а копий одного файла в репозитории быть не должно
    server: {port: 5181, fs: {allow: ['..']}}
})
