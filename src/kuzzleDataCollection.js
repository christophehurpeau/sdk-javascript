var
  KuzzleDocument = require('./kuzzleDocument'),
  KuzzleDataMapping = require('./kuzzleDataMapping'),
  KuzzleRoom = require('./kuzzleRoom');

/**
 * This is a global callback pattern, called by all asynchronous functions of the Kuzzle object.
 *
 * @callback responseCallback
 * @param {Object} err - Error object, NULL if the query is successful
 * @param {Object} data - The content of the query response
 */

/**
 * A data collection is a set of data managed by Kuzzle. It acts like a data table for persistent documents,
 * or like a room for pub/sub messages.
 * @param {object} kuzzle - Kuzzle instance to inherit from
 * @param {string} collection - name of the data collection to handle
 * @constructor
 */
function KuzzleDataCollection(kuzzle, collection) {
  Object.defineProperties(this, {
    // read-only properties
    collection: {
      value: collection,
      enumerable: true
    },
    kuzzle: {
      value: kuzzle,
      enumerable: true
    },
    // writable properties
    headers: {
      value: JSON.parse(JSON.stringify(kuzzle.headers)),
      enumerable: true,
      writable: true
    }
  });

  if (this.kuzzle.bluebird) {
    return this.kuzzle.bluebird.promisifyAll(this, {
      suffix: 'Promise',
      filter: function (name, func, target, passes) {
        var blacklist = ['publish', 'setHeaders', 'subscribe'];

        return passes && blacklist.indexOf(name) === -1;
      }
    });
  }

  return this;
}

/**
 * Executes an advanced search on the data collection.
 *
 * /!\ There is a small delay between documents creation and their existence in our advanced search layer,
 * usually a couple of seconds.
 * That means that a document that was just been created won’t be returned by this function.
 *
 * @param {object} filters - Filters in Elasticsearch Query DSL format
 * @param {object} [options] - Optional parameters
 * @param {responseCallback} cb - Handles the query response
 * @returns {Object} this
 */
KuzzleDataCollection.prototype.advancedSearch = function (filters, options, cb) {
  var
    query,
    self = this;

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  self.kuzzle.callbackRequired('KuzzleDataCollection.advancedSearch', cb);

  query = self.kuzzle.addHeaders({body: filters}, this.headers);

  self.kuzzle.query(this.collection, 'read', 'search', query, options, function (error, result) {
    var documents = [];

    if (error) {
      return cb(error);
    }

    result.hits.hits.forEach(function (doc) {
      documents.push(self.documentFactory(doc._id, doc));
    });

    cb(null, { total: result.hits.total, documents: documents });
  });

  return this;
};

/**
 * Returns the number of documents matching the provided set of filters.
 *
 * There is a small delay between documents creation and their existence in our advanced search layer,
 * usually a couple of seconds.
 * That means that a document that was just been created won’t be returned by this function
 *
 * @param {object} filters - Filters in Elasticsearch Query DSL format
 * @param {object} [options] - Optional parameters
 * @param {responseCallback} cb - Handles the query response
 * @returns {Object} this
 */
KuzzleDataCollection.prototype.count = function (filters, options, cb) {
  var query;

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  this.kuzzle.callbackRequired('KuzzleDataCollection.count', cb);

  query = this.kuzzle.addHeaders({body: filters}, this.headers);

  this.kuzzle.query(this.collection, 'read', 'count', query, options, function (error, result) {
    if (error) {
      return cb(error);
    }

    cb(null, result.count);
  });

  return this;
};

/**
 * Create a new empty data collection, with no associated mapping.
 * Kuzzle automatically creates data collections when storing documents, but there are cases where we
 * want to create and prepare data collections before storing documents in it.
 *
 * @param {object} [options] - Optional parameters
 * @param {responseCallback} [cb] - returns Kuzzle's response
 * @returns {*} this
 */
KuzzleDataCollection.prototype.create = function (options, cb) {
  var data = {};

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  data = this.kuzzle.addHeaders(data, this.headers);
  this.kuzzle.query(this.collection, 'write', 'createCollection', data, options, cb);

  return this;
};

/**
 * Create a new document in Kuzzle.
 *
 * Takes an optional argument object with the following properties:
 *    - metadata (object, default: null):
 *        Additional information passed to notifications to other users
 *    - updateIfExist (boolean, default: false):
 *        If the same document already exists: throw an error if sets to false.
 *        Update the existing document otherwise
 *
 * @param {object} document - either an instance of a KuzzleDocument object, or a document
 * @param {object} [options] - optional arguments
 * @param {responseCallback} [cb] - Handles the query response
 * @returns {Object} this
 */
KuzzleDataCollection.prototype.createDocument = function (document, options, cb) {
  var
    self = this,
    data = {},
    action = 'create';

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  if (document instanceof KuzzleDocument) {
    data = document.toJSON();
  } else {
    data.body = document;
  }

  if (options) {
    action = options.updateIfExist ? 'createOrUpdate' : 'create';
  }

  data.persist = true;
  data = self.kuzzle.addHeaders(data, self.headers);

  if (cb) {
    self.kuzzle.query(this.collection, 'write', action, data, options, function (err, res) {
      if (err) {
        return cb(err);
      }

      cb(null, self.documentFactory(res._id, res));
    });
  } else {
    this.kuzzle.query(this.collection, 'write', action, data, options);
  }

  return this;
};

/**
 * Delete this data collection and all documents in it.
 *
 * @param {object} [options] - Optional parameters
 * @param {responseCallback} [cb] - returns Kuzzle's response
 * @returns {*} this
 */
KuzzleDataCollection.prototype.delete = function (options, cb) {
  var data = {};

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  data = this.kuzzle.addHeaders(data, this.headers);
  this.kuzzle.query(this.collection, 'admin', 'deleteCollection', data, options, cb);

  return this;
};

/**
 * Delete persistent documents.
 *
 * There is a small delay between documents creation and their existence in our advanced search layer,
 * usually a couple of seconds.
 * That means that a document that was just been created won’t be returned by this function
 *
 * Takes an optional argument object with the following properties:
 *    - metadata (object, default: null):
 *        Additional information passed to notifications to other users
 *
 * @param {string|object} arg - Either a document ID (will delete only this particular document), or a set of filters
 * @param {object} [options] - optional arguments
 * @param {responseCallback} [cb] - Handles the query response
 * @returns {Object} this
 */
KuzzleDataCollection.prototype.deleteDocument = function (arg, options, cb) {
  var
    action,
    data = {};

  if (typeof arg === 'string') {
    data._id = arg;
    action = 'delete';
  } else {
    data.body = arg;
    action = 'deleteByQuery';
  }

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  data = this.kuzzle.addHeaders(data, this.headers);

  if (cb) {
    this.kuzzle.query(this.collection, 'write', action, data, options, function (err, res) {
      if (err) {
        return cb(err);
      }

      if (action === 'delete') {
        cb(null, [data._id]);
      } else {
        cb(null, res.ids);
      }
    });
  } else {
    this.kuzzle.query(this.collection, 'write', action, data, options);
  }

  return this;
};

/**
 * Retrieve a single stored document using its unique document ID.
 *
 * @param {string} documentId - Unique document identifier
 * @param {object} [options] - Optional parameters
 * @param {responseCallback} cb - Handles the query response
 * @returns {Object} this
 */
KuzzleDataCollection.prototype.fetchDocument = function (documentId, options, cb) {
  var
    data = {_id: documentId},
    self = this;

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  self.kuzzle.callbackRequired('KuzzleDataCollection.fetch', cb);
  data = self.kuzzle.addHeaders(data, this.headers);

  self.kuzzle.query(this.collection, 'read', 'get', data, options, function (err, res) {
    if (err) {
      return cb(err);
    }

    cb(null, self.documentFactory(res._id, res));
  });

  return this;
};

/**
 * Retrieves all documents stored in this data collection
 *
 * @param {object} [options] - Optional parameters
 * @param {responseCallback} cb - Handles the query response
 * @returns {Object} this
 */
KuzzleDataCollection.prototype.fetchAllDocuments = function (options, cb) {
  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  this.kuzzle.callbackRequired('KuzzleDataCollection.fetchAll', cb);

  this.advancedSearch({}, options, cb);

  return this;
};


/**
 * Instantiates a KuzzleDataMapping object containing the current mapping of this collection.
 *
 * @param {object} [options] - Optional parameters
 * @param {responseCallback} cb - Returns an instantiated KuzzleDataMapping object
 * @return {object} this
 */
KuzzleDataCollection.prototype.getMapping = function (options, cb) {
  var kuzzleMapping;

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  this.kuzzle.callbackRequired('KuzzleDataCollection.getMapping', cb);

  kuzzleMapping = new KuzzleDataMapping(this);
  kuzzleMapping.refresh(options, cb);

  return this;
};

/**
 * Publish a realtime message
 *
 * Takes an optional argument object with the following properties:
 *    - metadata (object, default: null):
 *        Additional information passed to notifications to other users
 *
 * @param {object} document - either a KuzzleDocument instance or a JSON object
 * @param {object} [options] - optional arguments
 * @returns {*} this
 */
KuzzleDataCollection.prototype.publish = function (document, options) {
  var data = {};

  if (document instanceof KuzzleDocument) {
    data = document.toJSON();
  } else {
    data.body = document;
  }

  data.persist = false;
  data = this.kuzzle.addHeaders(data, this.headers);
  this.kuzzle.query(this.collection, 'write', 'create', data, options);

  return this;
};

/**
 * Update a new mapping to the data collection.
 * Note that you cannot delete an existing mapping, you can only add or update one.
 *
 * @param {object} mapping - mapping to apply
 * @param {object} [options] - optional arguments
 * @param {responseCallback} [cb] - Returns an instantiated KuzzleDataMapping object
 * @returns {*} this
 */
KuzzleDataCollection.prototype.putMapping = function (mapping, options, cb) {
  var dataMapping;

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  dataMapping = new KuzzleDataMapping(this, mapping);
  dataMapping.apply(options, cb);

  return this;
};

/**
 * Replace an existing document with a new one.
 *
 * Takes an optional argument object with the following properties:
 *    - metadata (object, default: null):
 *        Additional information passed to notifications to other users
 *
 * @param {string} documentId - Unique document identifier of the document to replace
 * @param {object} content - JSON object representing the new document version
 * @param {object} [options] - additional arguments
 * @param {responseCallback} [cb] - Returns an instantiated KuzzleDocument object
 * @return {object} this
 */
KuzzleDataCollection.prototype.replaceDocument = function (documentId, content, options, cb) {
  var
    self = this,
    data = {
      _id: documentId,
      body: content
    };

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  data = self.kuzzle.addHeaders(data, this.headers);

  if (cb) {
    self.kuzzle.query(this.collection, 'write', 'createOrUpdate', data, options, function (err, res) {
      if (err) {
        return cb(err);
      }

      cb(null, self.documentFactory(res._id, res));
    });
  } else {
    self.kuzzle.query(this.collection, 'write', 'createOrUpdate', data, options);
  }

  return this;
};

/**
 * Subscribes to this data collection with a set of filters.
 * To subscribe to the entire data collection, simply provide an empty filter.
 *
 * @param {object} filters - Filters in Kuzzle DSL format
 * @param {responseCallback} cb - called for each new notification
 * @param {object} [options] - subscriptions options
 * @returns {*} KuzzleRoom object
 */
KuzzleDataCollection.prototype.subscribe = function (filters, cb, options) {
  var room;

  this.kuzzle.callbackRequired('KuzzleDataCollection.subscribe', cb);

  room = new KuzzleRoom(this, options);

  return room.renew(filters, cb);
};

/**
 * Truncate the data collection, removing all stored documents but keeping all associated mappings.
 * This method is a lot faster than removing all documents using a query.
 *
 * @param {object} [options] - Optional parameters
 * @param {responseCallback} [cb] - returns Kuzzle's response
 * @returns {*} this
 */
KuzzleDataCollection.prototype.truncate = function (options, cb) {
  var data = {};

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  data = this.kuzzle.addHeaders(data, this.headers);
  this.kuzzle.query(this.collection, 'admin', 'truncateCollection', data, options, cb);

  return this;
};


/**
 * Update parts of a document
 *
 * Takes an optional argument object with the following properties:
 *    - metadata (object, default: null):
 *        Additional information passed to notifications to other users
 *
 * @param {string} documentId - Unique document identifier of the document to update
 * @param {object} content - JSON object containing changes to perform on the document
 * @param {object} [options] - Optional parameters
 * @param {responseCallback} [cb] - Returns an instantiated KuzzleDocument object
 * @return {object} this
 */
KuzzleDataCollection.prototype.updateDocument = function (documentId, content, options, cb) {
  var
    data = {
      _id: documentId,
      body: content
    },
    self = this;

  if (!cb && typeof options === 'function') {
    cb = options;
    options = null;
  }

  data = self.kuzzle.addHeaders(data, this.headers);

  if (cb) {
    self.kuzzle.query(this.collection, 'write', 'update', data, options, function (err, res) {
      var doc;
      if (err) {
        return cb(err);
      }

      doc = new KuzzleDocument(self, res._id);
      cb(null, doc);
    });
  } else {
    self.kuzzle.query(this.collection, 'write', 'update', data, options);
  }

  return self;
};


/**
 * Instantiate a new KuzzleDocument object. Workaround to the module.exports limitation, preventing multiple
 * constructors to be exposed without having to use a factory or a composed object.
 *
 * @param {string} id - document id
 * @param {object} content - document content
 * @constructor
 */
KuzzleDataCollection.prototype.documentFactory = function (id, content) {
  var document = content._source ? new KuzzleDocument(this, id, content._source) : new KuzzleDocument(this, id, content);

  if (content._version) {
    document.version = content._version;
  }

  return document;
};

/**
 * Instantiate a new KuzzleRoom object. Workaround to the module.exports limitation, preventing multiple
 * constructors to be exposed without having to use a factory or a composed object.
 *
 * @param {object} [options] - subscription configuration
 * @constructor
 */
KuzzleDataCollection.prototype.roomFactory = function (options) {
  return new KuzzleRoom(this, options);
};

/**
 * Instantiate a new KuzzleDataMapping object. Workaround to the module.exports limitation, preventing multiple
 * constructors to be exposed without having to use a factory or a composed object.
 *
 * @param {object} [mapping] - mapping to instantiate the KuzzleDataMapping object with
 * @constructor
 */
KuzzleDataCollection.prototype.dataMappingFactory = function (mapping) {
  return new KuzzleDataMapping(this, mapping);
};

/**
 * Helper function allowing to set headers while chaining calls.
 *
 * If the replace argument is set to true, replace the current headers with the provided content.
 * Otherwise, it appends the content to the current headers, only replacing already existing values
 *
 * @param content - new headers content
 * @param [replace] - default: false = append the content. If true: replace the current headers with tj
 */
KuzzleDataCollection.prototype.setHeaders = function (content, replace) {
  this.kuzzle.setHeaders.call(this, content, replace);
  return this;
};

module.exports = KuzzleDataCollection;
