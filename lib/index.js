'use strict';
var chalk = require('chalk');
var errorize = require('errorable-express');
var validator = require('node-form-validator');

var skipper = require('skipper');
var bodyParser = require('body-parser');

// The actions vig routing system will handle.
var actions = [
  'routers',
  'validations',
  'policies'];

var policies = require('./policies');
var validations = require('./validations');
var events = require('./events');
var httpMethods = require('./http/methods');
var models = require('./models');
var uploaders = require('./uploaders');

var vig = {
  policies: policies,
  validations: validations,
  events: events,
  models: models,
  uploaders: uploaders,
  normalize: function (app) {
    // parse raw xml data
    app.use(bodyParser.raw({
      type: 'text/xml'
    }));

    // parse application/x-www-form-urlencoded
    app.use(bodyParser.urlencoded({
      extended: false
    }));

    // enabled file uploading
    app.use(skipper());
    app.use(uploaders.asUploader);
  },
  init: function (app, errors) {
    vig.normalize(app);
    if (errors) {
      vig.errorize(app, errors);
    }
    vig.policize(app);
    vig.validize(app);
    vig.modelize(app);
  },
  modelize: function (app) {
    app.use(function (req, res, next) {
      req.models = {};
      if (models._models) {
        req.models = models._models;
      }
      next();
    });
  },
  errorize: function (app, errors) {
    app.use(errorize(errors));
  },
  validize: function (app) {
    app.use(validator.asConnect);
    app.use(validations.use);
  },
  policize: function (app) {
    app.use(policies.use);
  },
  addHandlers: function (app, handlers) {
    for (var i = 0; i < handlers.length; i++) {
      var handler = handlers[i];
      vig.addHandler(app, handler);
      vig.events.add(handler.events);
    }
  },
  _getKeys: function (handler) {
    var objects = [];
    for (var o = 0; o < actions.length; o++) {
      if (handler[actions[o]]) {
        objects.push(handler[actions[o]]);
      }
    }
    var keys = [];
    objects.forEach(function (item) {
      var inKeys = Object.keys(item);
      keys = keys.concat(inKeys);
    });
    keys = keys.filter(function (value, index, self) {
      if (value === 'methods') {
        return false;
      }
      return self.indexOf(value) === index;
    });
    return keys;
  },
  processHandler: function (app, options) {
    var action = options.action;
    var handler = options.handler;
    var prefix = handler.prefix || '';
    var conditions = handler.conditions;
    var validations = handler.validations;
    var methods = vig._getKeys(handler);

    for (var i = 0; i < methods.length; i++) {
      var method = methods[i];
      if (!handler[action][method]) {
        continue;
      }
      var condition = conditions && conditions[method] ? conditions[method] : null;
      var validation = validations && validations[method] ? validations[method] : null;
      vig.addAction({
        method: method.toLowerCase(),
        prefix: prefix,
        urls: handler.urls,
        action: action,
        condition: condition,
        validation: validation,
        failures: handler.failures
      }, app, handler[action][method]);
    }
  },
  addHandler: function (app, handler) {
    var urls = handler.urls;
    if (!urls || !urls.length) {
      return;
    }
    for (var k = 0; k < actions.length; k++) {
      var action = actions[k];
      if (handler[action]) {
        vig.processHandler(app, {
          handler: handler,
          action: action
        });
      }
    }
  },
  addAction: function (options, app, handler) {
    if (httpMethods.indexOf(options.method) === -1) {
      console.error('HTTP Method ' + chalk.red(options.method.toUpperCase()) + ' is not valid!');
      return;
    }
    switch (options.action) {
      case 'policies':
        policies.add(options.method, options, handler);
        break;
      default:
        vig.addRouters(options.method, options, app, handler);
        validations.add({
          method: options.method,
          condition: options.condition,
          validation: options.validation,
          handler: handler,
          failures: options.failures
        },
          options
        );
        break;
    }
  },
  addRouters: function (method, options, app, handler) {
    if (typeof handler === 'function') {
      options.urls.forEach(function (url) {
        app[method](options.prefix + url, handler);
      });
    }
  }
};

module.exports = vig;
