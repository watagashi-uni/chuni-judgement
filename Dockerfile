FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json LICENSE NOTICE README.md ./
COPY --chown=node:node src ./src
COPY --chown=node:node server ./server
COPY --chown=node:node public ./public
COPY --chown=node:node bin ./bin
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
