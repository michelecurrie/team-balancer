import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// IMPORTANT: base must match your GitHub repo name exactly, wrapped in slashes.
// If your repo is github.com/yourname/team-balancer, this should be '/team-balancer/'.
// If this is a "yourname.github.io" repo (your user/org page), use base: '/' instead.
export default defineConfig({
  plugins: [react()],
  base: 'github.com/michelecurrie/team-balancer',
})
