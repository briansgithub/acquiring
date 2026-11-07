import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({build:{outDir:'.artifacts/pwa-port/harvest-worker-bundle',emptyOutDir:false,lib:{entry:fileURLToPath(new URL('./index.ts',import.meta.url)),formats:['es'],fileName:()=> 'harvest-worker.js'}}});
