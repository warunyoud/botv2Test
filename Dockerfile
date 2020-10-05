 FROM node:10

 WORKDIR /app

 COPY package* /app/
 RUN npm ci

 COPY *.js /app/

 # DevOps can override this entrypoint to other command later
 ENTRYPOINT ["npm", "run", "start"]