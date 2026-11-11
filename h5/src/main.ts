import { mount } from 'svelte'
import '@luna/theme-chalk/index.scss'
import './styles/index.css'
import { applyTheme, readTheme } from '@luna/components/theme'
import App from './App.svelte'

applyTheme(readTheme())

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
