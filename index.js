'use strict';

const express = require('express');
const fs = require('fs');

const BotKing = require('bot-king');
const ekoInterface = require('bot-king-eko-interface');

const config = require('./config')

const workflowTemplate = require('./templates/workflow.json');
const libraryTemplate = require('./templates/library.json');

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

const searchWorkflow = async (client, userId, keyword, tries = 0) => {
  try {
    // Retrieve only the first 13 elements, as that's the maximum number
    // of quick replies allowed.
    const endpoint = 'api/workflow/v1/users/' + userId + '?keyword=' + keyword + '&limit=13';
    const response = await client.instance.get(endpoint);
    const data = await response.data;

    return data.workflows || [];
  } catch (error) {
    console.log(error);
    
    if (error.response && error.response.status === 401 && tries < 1) {
      await client.token();
      return searchWorkflow(client, userId, keyword, tries + 1);
    } else {
      return [];
    }
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

const searchWorkflowTemplate = async (client, keyword, tries = 0) => {
  try {
    // Retrieve only the first 13 elements, as that's the maximum number
    // of quick replies allowed.
    const endpoint = 'api/workflow/v1?keyword=' + keyword + '&limit=13';
    const response = await client.instance.get(endpoint);
    const data = await response.data;
    
    return data.templates || [];
  } catch (error) {
    console.log(error);
    
    if (error.response && error.response.status === 401 && tries < 1) {
      await client.token();
      return searchWorkflowTemplate(client, keyword, tries + 1);
    } else {
      return [];
    }
  }
}

/*
 * Library
 */

const createLibraryResponse = (libraryItems) => {
  const response = Object.assign({}, libraryTemplate);

  const items = libraryItems.map(libraryItem => {
    return {
        type: "action",
        action: {
            type: "library",
            label: trimLabel(libraryItem.label),
            url: libraryItem.url,
        }
    }
  });

  response.quickReply.items = items;

  if (items.length === 0) {
    response.text = "We couldn't find any library items that matched the search criteria";
  }

  return [response];
}

const searchLibrary = async (client, userId, keyword, tries = 0) => {
  try {
    // Retrieve only the first 13 elements, as that's the maximum number
    // of quick replies allowed.
    const endpoint = 'api/library/v1/users/' + userId + '?keyword=' + keyword + '&limit=13';
    const response = await client.instance.get(endpoint);
    const data = await response.data;

    return (data && data.length >= 0) ? data : [];
  } catch (error) {
    console.log(error);
    
    if (error.response && error.response.status === 401 && tries < 1) {
      await client.token();
      return searchLibrary(client, userId, keyword, tries + 1);
    } else {
      return [];
    }
  }
}

/*
 * User
 */

const searchUser = async (client, groupId, userId, tries = 0) => {
  try {
    const endpoint = `bot/v2/groups/${groupId}/users/${userId}/info`;
    const response = await client.instance.get(endpoint);
    const user = await response.data;
    
    return user || {};
  } catch (error) {
    console.log(error);

    if (error.response && error.response.status === 401 && tries < 1) {
      await client.token();
      return searchUser(client, groupId, userId, tries + 1);
    } else {
      return {};
    }
  }
}

/*
 * Workflow Webhook
 */

const createWorkflowWebhookResponse = (type, wid, title) => {
  return [{
    type: "text",
    text: `Event received for Workflow "${title}" (id = "${wid}") - Type "${type}"`,
  }];
}

const getGroupAndThreadForUser = async (client, userId) => {
  try {
    const endpoint = 'bot/v2/groups/users/' + userId;
    const response = await client.instance.get(endpoint);
    const data = await response.data;

    return data;
  } catch (error) {
    console.log(error);
    return {};
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

          clients[path].replyV2(replyToken, [
            {
              "type": "text",
              "text": postback.text || 'Postback received!'
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
          } else if (/\/searchLibrary\s.+$/.test(message.text)) {
            const keyword = message.text.substr(message.text.indexOf(' ') + 1);
            const userId = event.source.userId;

            // Retrieve workflow from API
            const templates = await searchLibrary(clients[path], userId, keyword);

            // Send reply
            const response = createLibraryResponse(templates);
            clients[path].replyV2(replyToken, response);
          } else if (/\/searchUser\s\w+\s\w+$/.test(message.text)) {
            const [_, gid, uid] = message.text.split(' ');

            // Retrieve workflow from API
            const user = await searchUser(clients[path], gid, uid);
            
            let output;

            if (user) {
              output = `User=${JSON.stringify(user)}`;
            } else {
              output = 'User not found';
            }

            clients[path].replyV2(replyToken, [
              {
                "type": "text",
                "text": output,
              }
            ]);
          } else {
            clients[path].replyV2(replyToken, createResponse(responseMap, message.text));
          }
          break;
        case 'workflow':
          const { workflow } = event;
          const { type, _id, title, recipients } = workflow;

          for (let i = 0; i < recipients.length; i++) {
            const recipient = recipients[i];
            const response = await getGroupAndThreadForUser(clients[path], recipient);

            if (response.gid && response.tid) {
              clients[path].pushV2(response.gid, response.tid, createWorkflowWebhookResponse(type, _id, title));
            }
          }

          break;
      }
    });
  } catch (error) {
    console.error(error);
  }
};
