 FROM node:10

 WORKDIR /app

 COPY package* /app/
 RUN npm ci

 COPY *.js /app/
 COPY templates /app/templates

 ENTRYPOINT ["npm", "run", "start"]
