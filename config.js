'use strict';

require('dotenv').config();

module.exports = {
  port: process.env.HTTP_PORT || 3000,
  responsePath: process.env.RESPONSE_PATH
};
