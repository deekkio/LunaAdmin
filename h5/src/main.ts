import { mount } from 'svelte'
import '@luna/theme-chalk/index.scss'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
