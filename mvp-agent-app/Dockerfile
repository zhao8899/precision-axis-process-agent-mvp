FROM node:20-alpine

WORKDIR /app

COPY mvp-agent-app/package.json ./package.json
COPY mvp-agent-app/server.js ./server.js
COPY mvp-agent-app/data ./data
COPY mvp-agent-app/public ./public
COPY MVP开发交付包 ./MVP开发交付包

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]
