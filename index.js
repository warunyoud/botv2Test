'use strict';

const express = require('express');
const fs = require('fs');

const BotKing = require('bot-king');
const ekoInterface = require('bot-king-eko-interface');

const config = require('./config')

const workflowTemplate = require('./templates/workflow.json');

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

/*
 * Workflows
 */

const createWorkflowResponse = (workflows) => {
  const response = Object.assign({}, workflowTemplate);

  const items = workflows.map(workflow => {
    return {
        type: "action",
        action: {
            type: "workflow",
            workflowId: workflow._id,
            label: trimLabel(workflow.title),
        }
    }
  });

  response.quickReply.items = items;

  if (items.length === 0) {
    response.text = "We couldn't find any workflow that matched the search criteria";
  }

  return [response];
}

const searchWorkflow = async (client, userId, keyword) => {
  try {
    const endpoint = 'api/workflow/v1/users/' + userId + '?keyword=' + keyword;
    const response = await client.instance.get(endpoint);
    const data = await response.data;

    return data.workflows || [];
  } catch (error) {
    console.log(error);
    return [];
  }
}

/*
 * Workflow Templates
 */

const createWorkflowTemplateResponse = (templates) => {
  const response = Object.assign({}, workflowTemplate);

  const items = templates.map(template => {
    return {
        type: "action",
        action: {
            type: "workflowTemplate",
            templateId: template._id,
            label: trimLabel(template.name),
        }
    }
  });

  response.quickReply.items = items;

  if (items.length === 0) {
    response.text = "We couldn't find any workflow that matched the search criteria";
  }

  return [response];
}

const searchWorkflowTemplate = async (client, keyword) => {
  try {
    const endpoint = 'api/workflow/v1?keyword=' + keyword;
    const response = await client.instance.get(endpoint);
    const data = await response.data;
    
    return data.templates || [];
  } catch (error) {
    console.log(error);
    return [];
  }
}

/*
 * Utils
 */

const trimLabel = (label) => {
  if (label && label.length >= 20) {
    return label.substring(0, 17) + '...';
  }

  return label;
}

/*
 * Middleware
 */

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
          } else if (/\/searchWorkflow\s.+$/.test(message.text)) {
            const keyword = message.text.substr(message.text.indexOf(' ') + 1);
            const userId = event.source.userId;

            // Retrieve workflow from API
            const workflows = await searchWorkflow(clients[path], userId, keyword);

            // Send reply
            const response = createWorkflowResponse(workflows)
            clients[path].replyV2(replyToken, response);
          } else if (/\/searchWorkflowTemplate\s.+$/.test(message.text)) {
            const keyword = message.text.substr(message.text.indexOf(' ') + 1);

            // Retrieve workflow from API
            const templates = await searchWorkflowTemplate(clients[path], keyword);

            // Send reply
            const response = createWorkflowTemplateResponse(templates);
            clients[path].replyV2(replyToken, response);
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
