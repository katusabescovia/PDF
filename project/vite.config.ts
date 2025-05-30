// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // WebSocket proxy (unchanged)
      '/socket.io': {
        target: 'ws://localhost:3001',
        ws: true,
      },

      // API Proxy for cleared students
      '/api/cleared-students': {
        target: 'https://eadmin.ciu.ac.ug',
        changeOrigin: true,
        rewrite: path =>
          path.replace(/^\/api\/cleared-students/, '/API/ClearedStudentsAPI.aspx'),
        secure: false, // use only if CIU site uses a self-signed certificate
      },

      // API Proxy for student exams
      '/api/student-exams': {
        target: 'https://eadmin.ciu.ac.ug',
        changeOrigin: true,
        rewrite: path =>
          path.replace(/^\/api\/student-exams/, '/API/StudentExamsAPI.aspx'),
        secure: false, // use only if CIU site uses a self-signed certificate
      },
    },
  },
});
