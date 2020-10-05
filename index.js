'use strict';

const express = require('express');
const fs = require('fs');

const BotKing = require('bot-king');
const ekoInterface = require('bot-king-eko-interface');

const config = require('./config')

const bot = new BotKing({
  middleware
});

const path = config.responsePath;
const ls = fs.readdirSync(path);

const app = express();
app.use(express.json());

const clients = {};

ls.forEach(dir => {
  const responsePath = `${path}/${dir}/response.json`;
  const OAuthFile = fs.readFileSync(`${path}/${dir}/oauth.json`);
  const { clientId, clientSecret, baseURL } = JSON.parse(OAuthFile);
  const { client } = ekoInterface(bot, {
    httpServer: {
      app,
      path: dir
    },
    eko: {
      clientId,
      clientSecret,
      baseURL
    }
  });
  client.responsePath = responsePath;
  clients[dir] = client;
});

app.listen(config.port || 80)

const createResponse = (responseMap, text) => {
  let response;
  if (responseMap) {
    response = responseMap[text]; 
  }
  if (!response) {
    response = [{
      "type": "text",
      "text": `${text} is not recognized`
    }]
  }
  return response;
}

async function middleware (params, path) {
  try {
    const { events } = params;
    console.log(events);
    const responseMap = JSON.parse(fs.readFileSync(clients[path].responsePath));
    events.forEach(async event => {
      const { replyToken } = event;
      switch (event.type) {
        case 'postback':
          const { postback } = event;
          client.replyV2(replyToken, [
            {
              "type": "text",
              "text": 'Postback received!'
            },
            {
              "type": "text",
              "text": `data=${postback.data}`
            }
          ])
          break;
        case 'message':
          const { message } = event;
          if (/\/send\s\w+\s\w+\s\w+$/.test(message.text)) {
            const [_, text, gid, tid] = message.text.split(' ');
            clients[path].pushV2(gid, tid, createResponse(responseMap, text));
          } else {
            clients[path].replyV2(replyToken, createResponse(responseMap, message.text));
          }
          break;
      }
    });
  } catch (error) {
    console.error(error);
  }
};
