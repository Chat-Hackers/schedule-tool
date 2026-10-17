FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json ./
COPY --chown=node:node scheduler ./scheduler
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=5057 DATA_FILE=/data/scheduler-data.json
EXPOSE 5057
CMD ["npm", "start"]
