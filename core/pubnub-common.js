var NOW             = 1
,   READY           = false
,   READY_BUFFER    = []
,   PRESENCE_SUFFIX = '-pnpres'
,   DEF_WINDOWING   = 10     // MILLISECONDS.
,   DEF_TIMEOUT     = 10000  // MILLISECONDS.
,   DEF_SUB_TIMEOUT = 310    // SECONDS.
,   DEF_KEEPALIVE   = 60     // SECONDS (FOR TIMESYNC).
,   SECOND          = 1000   // A THOUSAND MILLISECONDS.
,   URLBIT          = '/'
,   PARAMSBIT       = '&'
,   PRESENCE_HB_THRESHOLD = 5
,   PRESENCE_HB_DEFAULT  = 30
,   SDK_VER         = VERSION
,   REPL            = /{([\w\-]+)}/g;

/**
 * UTILITIES
 */
function unique() { return'x'+ ++NOW+''+(+new Date) }
function rnow()   { return+new Date }

/**
 * NEXTORIGIN
 * ==========
 * var next_origin = nextorigin();
 */
var nextorigin = (function() {
    var max = 20
    ,   ori = Math.floor(Math.random() * max);
    return function( origin, failover ) {
        return origin.indexOf('pubsub.') > 0
            && origin.replace(
             'pubsub', 'ps' + (
                failover ? uuid().split('-')[0] :
                (++ori < max? ori : ori=1)
            ) ) || origin;
    }
})();


/**
 * Build Url
 * =======
 *
 */
function build_url( url_components, url_params ) {
    var url    = url_components.join(URLBIT)
    ,   params = [];

    if (!url_params) return url;

    each( url_params, function( key, value ) {
        var value_str = (typeof value == 'object')?JSON['stringify'](value):value;
        (typeof value != 'undefined' &&
            value != null && encode(value_str).length > 0
        ) && params.push(key + "=" + encode(value_str));
    } );
    url += "?" + params.join(PARAMSBIT);

    return url;
}

/**
 * UPDATER
 * =======
 * var timestamp = unique();
 */
function updater( fun, rate ) {
    var timeout
    ,   last   = 0
    ,   runnit = function() {
        if (last + rate > rnow()) {
            clearTimeout(timeout);
            timeout = setTimeout( runnit, rate );
        }
        else {
            last = rnow();
            fun();
        }
    };

    return runnit;
}

/**
 * GREP
 * ====
 * var list = grep( [1,2,3], function(item) { return item % 2 } )
 */
function grep( list, fun ) {
    var fin = [];
    each( list || [], function(l) { fun(l) && fin.push(l) } );
    return fin
}

/**
 * SUPPLANT
 * ========
 * var text = supplant( 'Hello {name}!', { name : 'John' } )
 */
function supplant( str, values ) {
    return str.replace( REPL, function( _, match ) {
        return values[match] || _
    } );
}

/**
 * timeout
 * =======
 * timeout( function(){}, 100 );
 */
function timeout( fun, wait ) {
    return setTimeout( fun, wait );
}

/**
 * uuid
 * ====
 * var my_uuid = uuid();
 */
function uuid(callback) {
    var u = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,
    function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
    if (callback) callback(u);
    return u;
}

function isArray(arg) {
  return !!arg && (Array.isArray && Array.isArray(arg) || typeof(arg.length) === "number")
}

/**
 * EACH
 * ====
 * each( [1,2,3], function(item) { } )
 */
function each( o, f) {
    if ( !o || !f ) return;

    if ( isArray(o) )
        for ( var i = 0, l = o.length; i < l; )
            f.call( o[i], o[i], i++ );
    else
        for ( var i in o )
            o.hasOwnProperty    &&
            o.hasOwnProperty(i) &&
            f.call( o[i], i, o[i] );
}

/**
 * MAP
 * ===
 * var list = map( [1,2,3], function(item) { return item + 1 } )
 */
function map( list, fun ) {
    var fin = [];
    each( list || [], function( k, v ) { fin.push(fun( k, v )) } );
    return fin;
}

/**
 * ENCODE
 * ======
 * var encoded_data = encode('path');
 */
function encode(path) { return encodeURIComponent(path) }

/**
 * Generate Subscription Channel List
 * ==================================
 * generate_channel_list(channels_object);
 */
function generate_channel_list(channels, nopresence) {
    var list = [];
    each( channels, function( channel, status ) {
        if (nopresence) {
            if(channel.search('-pnpres') < 0) { 
                if (status.subscribed) list.push(channel);
            }    
        } else {
            if (status.subscribed) list.push(channel);
        }  
    });
    return list.sort();
}


// PUBNUB READY TO CONNECT
function ready() { timeout( function() {
    if (READY) return;
    READY = 1;
    each( READY_BUFFER, function(connect) { connect() } );
}, SECOND ); }

function PNmessage(args) {
    msg = args || {'apns' : {}},
    msg['getPubnubMessage'] = function() {
        var m = {};

        if (Object.keys(msg['apns']).length) {
            m['pn_apns'] = {
                    'aps' : {
                        'alert' : msg['apns']['alert'] ,
                        'badge' : msg['apns']['badge']
                    }
            }
            for (var k in msg['apns']) {
                m['pn_apns'][k] = msg['apns'][k];
            }
            var exclude1 = ['badge','alert'];
            for (var k in exclude1) {
                delete m['pn_apns'][exclude1[k]];
            }
        }



        if (msg['gcm']) {
            m['pn_gcm'] = {
                'data' : msg['gcm']
            } 
        }

        for (var k in msg) {
            m[k] = msg[k];
        }
        var exclude = ['apns','gcm','publish', 'channel','callback','error'];
        for (var k in exclude) {
            delete m[exclude[k]];
        }

        return m;
    };
    msg['publish'] = function() {
        
        var m = msg.getPubnubMessage();
        
        if (msg['pubnub'] && msg['channel']) {
            msg['pubnub'].publish({
                'message' : m,
                'channel' : msg['channel'],
                'callback' : msg['callback'],
                'error' : msg['error']
            })
        }
    };
    return msg;
}

Object.size = function(obj) {
    var size = 0, key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};

function PN_API(setup) {
    var SUB_WINDOWING =  +setup['windowing']   || DEF_WINDOWING
    ,   SUB_TIMEOUT   = (+setup['timeout']     || DEF_SUB_TIMEOUT) * SECOND
    ,   KEEPALIVE     = (+setup['keepalive']   || DEF_KEEPALIVE)   * SECOND
    ,   NOLEAVE       = setup['noleave']       || 0
    ,   PUBLISH_KEY   = setup['publish_key']   || setup['write_key'] || 'demo'
    ,   SUBSCRIBE_KEY = setup['subscribe_key'] || setup['read_key']  || 'demo'
    ,   AUTH_KEY      = setup['auth_key']      || ''
    ,   SECRET_KEY    = setup['secret_key']    || ''
    ,   hmac_SHA256   = setup['hmac_SHA256']
    ,   SSL           = setup['ssl']            ? 's' : ''
    ,   ORIGIN        = 'http'+SSL+'://'+(setup['origin']||'pubsub.pubnub.com')
    ,   STD_ORIGIN    = nextorigin(ORIGIN)
    ,   SUB_ORIGIN    = nextorigin(ORIGIN)
    ,   CONNECT       = function(){}
    ,   PUB_QUEUE     = []
    ,   TIME_DRIFT    = 0
    ,   SUB_CALLBACK  = 0
    ,   SUB_CHANNEL   = 0
    ,   SUB_RECEIVER  = 0
    ,   SUB_RESTORE   = setup['restore'] || 0
    ,   SUB_BUFF_WAIT = 0
    ,   TIMETOKEN     = 0
    ,   RESUMED       = false
    ,   CHANNELS      = {}
    ,   STATE         = {}
    ,   PRESENCE_HB_TIMEOUT  = null
    ,   DS_PATH_TTS   = {}
    ,   PRESENCE_HB          = validate_presence_heartbeat(setup['heartbeat'] || setup['pnexpires'] || 0, setup['error'])
    ,   PRESENCE_HB_INTERVAL = setup['heartbeat_interval'] || PRESENCE_HB - 3
    ,   PRESENCE_HB_RUNNING  = false
    ,   NO_WAIT_FOR_PENDING  = setup['no_wait_for_pending']
    ,   COMPATIBLE_35 = setup['compatible_3.5']  || false
    ,   xdr           = setup['xdr']
    ,   params        = setup['params'] || {}
    ,   error         = setup['error']      || function() {}
    ,   _is_online    = setup['_is_online'] || function() { return 1 }
    ,   jsonp_cb      = setup['jsonp_cb']   || function() { return 0 }
    ,   db            = setup['db']         || {'get': function(){}, 'set': function(){}}
    ,   CIPHER_KEY    = setup['cipher_key']
    ,   UUID          = setup['uuid'] || ( db && db['get'](SUBSCRIBE_KEY+'uuid') || '');

    var crypto_obj    = setup['crypto_obj'] ||
        {
            'encrypt' : function(a,key){ return a},
            'decrypt' : function(b,key){return b}
        };

    function _get_url_params(data) {
        if (!data) data = {};
        each( params , function( key, value ) {
            if (!(key in data)) data[key] = value;
        });
        return data;
    }

    function _object_to_key_list(o) {
        var l = []
        each( o , function( key, value ) {
            l.push(key);
        });
        return l;
    }    
    function _object_to_key_list_sorted(o) {
        return _object_to_key_list(o).sort();
    }

    function _get_pam_sign_input_from_params(params) {
        var si = "";
        var l = _object_to_key_list_sorted(params);

        for (var i in l) {
            var k = l[i]
            si += k + "=" + encode(params[k]) ;
            if (i != l.length - 1) si += "&"
        }
        return si;
    }

    function validate_presence_heartbeat(heartbeat, cur_heartbeat, error) {
        var err = false;

        if (typeof heartbeat === 'number') {
            if (heartbeat > PRESENCE_HB_THRESHOLD || heartbeat == 0)
                err = false;
            else
                err = true;
        } else if(typeof heartbeat === 'boolean'){
            if (!heartbeat) {
                return 0;
            } else {
                return PRESENCE_HB_DEFAULT;
            }
        } else {
            err = true;
        }

        if (err) {
            error && error("Presence Heartbeat value invalid. Valid range ( x > " + PRESENCE_HB_THRESHOLD + " or x = 0). Current Value : " + (cur_heartbeat || PRESENCE_HB_THRESHOLD));
            return cur_heartbeat || PRESENCE_HB_THRESHOLD;
        } else return heartbeat;
    }

    function encrypt(input, key) {
        return crypto_obj['encrypt'](input, key || CIPHER_KEY) || input;
    }
    function decrypt(input, key) {
        return crypto_obj['decrypt'](input, key || CIPHER_KEY) ||
               crypto_obj['decrypt'](input, CIPHER_KEY) ||
               input;
    }

    function error_common(message, callback) {
        callback && callback({ 'error' : message || "error occurred"});
        error && error(message);
    }
    function _presence_heartbeat() {

        clearTimeout(PRESENCE_HB_TIMEOUT);

        if (!PRESENCE_HB_INTERVAL || PRESENCE_HB_INTERVAL >= 500 || PRESENCE_HB_INTERVAL < 1 || !generate_channel_list(CHANNELS,true).length){
            PRESENCE_HB_RUNNING = false;
            return;
        }

        PRESENCE_HB_RUNNING = true;
        SELF['presence_heartbeat']({
            'callback' : function(r) {
                PRESENCE_HB_TIMEOUT = timeout( _presence_heartbeat, (PRESENCE_HB_INTERVAL) * SECOND );
            },
            'error' : function(e) {
                error && error("Presence Heartbeat unable to reach Pubnub servers." + JSON.stringify(e));
                PRESENCE_HB_TIMEOUT = timeout( _presence_heartbeat, (PRESENCE_HB_INTERVAL) * SECOND );
            }
        });
    }

    function start_presence_heartbeat() {
        !PRESENCE_HB_RUNNING && _presence_heartbeat();
    }

    function publish(next) {

        if (NO_WAIT_FOR_PENDING) {
            if (!PUB_QUEUE.length) return;
        } else {
            if (next) PUB_QUEUE.sending = 0;
            if ( PUB_QUEUE.sending || !PUB_QUEUE.length ) return;
            PUB_QUEUE.sending = 1;
        }

        xdr(PUB_QUEUE.shift());
    }

    function each_channel(callback) {
        var count = 0;

        each( generate_channel_list(CHANNELS), function(channel) {
            var chan = CHANNELS[channel];

            if (!chan) return;

            count++;
            (callback||function(){})(chan);
        } );

        return count;
    }
    function _invoke_callback(response, callback, err) {
        if (typeof response == 'object') {
            if (response['error'] && response['message'] && response['payload']) {
                err({'message' : response['message'], 'payload' : response['payload']});
                return;
            }
            if (response['payload']) {
                if (response['next_page'])
                    callback(response['payload'], response['next_page']);
                else 
                    callback(response['payload']);
                return;
            }
        }
        callback(response);
    }

    function _invoke_error(response,err) {
        if (typeof response == 'object' && response['error'] &&
            response['message'] && response['payload']) {
            err({'message' : response['message'], 'payload' : response['payload']});
        } else err(response);
    }

    function apply_update(o, update, depth) {

        // get update path from response
        var path    = update.location.split(".");
        var action  = update.action;
        
        var path_length = path.length;
        
        // references to nodes in the path
        var pathNodes = [];

        // last node name
        var last = path.pop();
        path.shift();


        if (depth) {
            for (var i = 0; i < depth; i++) path.shift();
        }
        
        // x is the place where data exists
        var x = o.data;


        //   ????
        var continue_update = true;

        // iterate over path elements
        for (p in path) {
            try {

                // if x does not containt a node with path reached till now
                // create the node . even if what x contains is not an object
                // create a new node at the location
                if (!x[path[p]] || typeof x[path[p]]  !== 'object') {
                    x[path[p]] = {};
                }
            } catch (e) {
                // add new object at the path, this is to create the same
                // tree structure in our internal object
                x[path[p]] = {};  
            }
            // x to next node in the path
            x = x[path[p]];

            // push node to nodes array
            pathNodes.push(x);
        }

        // handle updation
        if (action == 'update') {
            if (path_length - depth > 0) 
                x[last] = update.value;
            else
                o.data  = update.value;

        }
        // handle deletion 
        else if (action == 'delete') {

            if (path_length - depth > 0) {

                // delete the last node
                delete x[last]

                // now return back to root while examining each node on path
                // if some node has become childless delete that node.

                for (var i = pathNodes.length - 1; i >= 1; i--) {
                    if (pathNodes[i] && Object.keys(pathNodes[i]).length == 0) {
                        delete pathNodes[i-1][path[i]]
                    }
                }

                if ( o.data[path[0]] && Object.keys(o.data[path[0]]).length == 0) {
                    delete o.data[path[0]];
                }
            } else {
                // complete tree empty now due to no non leaf node existence
                o.data = {}
            }
        }

        // return update at , need to reconsider
        return update['updateAt'];   
    }
    function apply_updates(o, updates, callback, trans_id, depth) {

        var update = updates[trans_id];

        var update_at;

        // apply update if update is complete
        if (update && update.complete == true) {
            var actions_list = update.list;
            var callback_param_list = [];

            // traverse actions list and apply each action
            for (var i in actions_list) {
                // action event
                var action_event = actions_list[i];

                // apply event, update at value will be returned
                action_event.update_at = apply_update(o, action_event, depth);

                // parse location and set for callback parameter data
                action_event.location = action_event.location.split("pn_ds_")[1];

                // cleanup
                delete action_event.trans_id;
                delete action_event.timetoken;
            }

            // invoke callback with actions_list as argument
            callback(actions_list);

            // delete update 

            delete update;
        }
    }

    function apply_all_updates(o, updates, callback, depth) {
        // iterate trhough all updates and apply
        for (var t in updates) {
            apply_updates(o, updates, callback, t, depth);
        }
    }

    /*
        Get to be used in Data sync
    */
    function get(args, callback) {
        var callback         = args['callback'] || callback
        ,   err              = args['error']    || function(){}
        ,   object_id        = args['object_id']
        ,   path             = args['path']
        ,   next_page        = args['next_page']
        ,   obj_at           = args['obj_at']
        ,   page_max_bytes   = args['page_max_bytes']
        ,   jsonp            = jsonp_cb()
        ,   auth_key         = args['auth_key'] || AUTH_KEY
        ,   data             = { 'uuid' : UUID, 'auth' : auth_key };

        // Make sure we have a Channel
        if (!object_id)     return error('Missing Object Id');
        if (!callback)      return error('Missing Callback');
        if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

        var url = [
            STD_ORIGIN, 'v1', 'datasync',
            'sub-key', SUBSCRIBE_KEY, 'obj-id', encode(object_id)
        ];

        if (path) {
            url.push(encode(path.split(".").join("/")));
        }

        if (jsonp != '0') { data['callback'] = jsonp; }

        //if (start_at) { data['start_at'] = start_at; }
        //if (obj_at)   { data['obj_at']   = obj_at; }
        if (page_max_bytes)   { data['page_max_bytes']   = page_max_bytes; }

        xdr({
            callback : jsonp,
            data     : _get_url_params(data),
            success  : function(response) {
                callback(response);
            },
            fail     : function(response) {
                _invoke_error(response, err);
            },
            url      : url
        });
    }

    /*
        This method does merge at one level
    */
    function mergeAtOneLevel(a, b) {

        // if a is null , return b

        if ( a == null ) {
            return b;
        }
        // if both a and b exist, then 
        if (a && b) {

            // iterate over keys in b
            for (var key in b) {

                // if key does not exist in a, then add add 
                // key to a
                if (!a[key]) {
                        a[key] = b[key];
                    
                }

                // if key exists in a, then do a recursive merge at
                // next level 
                else {
                
                    a[key] = mergeAtOneLevel(a[key], b[key]);
                
                }
            }
        }

        // returned reference to merged node
        return a;
    }

    // Announce Leave Event
    var SELF = {
        'LEAVE' : function( channel, blocking, callback, error ) {

            var data   = { 'uuid' : UUID, 'auth' : AUTH_KEY }
            ,   origin = nextorigin(ORIGIN)
            ,   callback = callback || function(){}
            ,   err      = error    || function(){}
            ,   jsonp  = jsonp_cb();

            // Prevent Leaving a Presence Channel
            if (channel.indexOf(PRESENCE_SUFFIX) > 0) return true;

            if (COMPATIBLE_35) {
                if (!SSL)         return false;
                if (jsonp == '0') return false;
            }
            
            if (NOLEAVE)  return false;

            if (jsonp != '0') data['callback'] = jsonp;

            xdr({
                blocking : blocking || SSL,
                timeout  : 2000,
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : [
                    origin, 'v2', 'presence', 'sub_key',
                    SUBSCRIBE_KEY, 'channel', encode(channel), 'leave'
                ]
            });
            return true;
        },
        'set_resumed' : function(resumed) {
                RESUMED = resumed;
        },
        'get_cipher_key' : function() {
            return CIPHER_KEY;
        },
        'set_cipher_key' : function(key) {
            CIPHER_KEY = key;
        },
        'raw_encrypt' : function(input, key) {
            return encrypt(input, key);
        },
        'raw_decrypt' : function(input, key) {
            return decrypt(input, key);
        },
        'get_heartbeat' : function() {
            return PRESENCE_HB;
        },
        'set_heartbeat' : function(heartbeat) {
            PRESENCE_HB = validate_presence_heartbeat(heartbeat, PRESENCE_HB_INTERVAL, error);
            PRESENCE_HB_INTERVAL = (PRESENCE_HB - 3 >= 1)?PRESENCE_HB - 3:1;
            CONNECT();
            _presence_heartbeat();
        },
        'get_heartbeat_interval' : function() {
            return PRESENCE_HB_INTERVAL;
        },
        'set_heartbeat_interval' : function(heartbeat_interval) {
            PRESENCE_HB_INTERVAL = heartbeat_interval;
            _presence_heartbeat();
        },
        'get_version' : function() {
            return SDK_VER;
        },
        'getGcmMessageObject' : function(obj) {
            return {
                'data' : obj
            }
        },
        'getApnsMessageObject' : function(obj) {
            var x =  {
                'aps' : { 'badge' : 1, 'alert' : ''}
            }
            for (k in obj) {
                k[x] = obj[k];
            }
            return x;
        },        
        'newPnMessage' : function() {
            var x = {};
            if (gcm) x['pn_gcm'] = gcm;
            if (apns) x['pn_apns'] = apns;
            for ( k in n ) {
                x[k] = n[k];
            }
            return x;
        },

        '_add_param' : function(key,val) {
            params[key] = val;
        },

        'get_synced_object' : function(args) {
            var callback         = args['callback']
            ,   err              = args['error']    || function(){}
            ,   connect          = args['connect']
            ,   object_id        = args['object_id']
            ,   path             = args['path'] || '';

            // Is object sync complete ?
            var synced = false;
            
            // depth at which we are listening 
            var depth = 0;

            var updates = {};
            

            // internal object
            var internal = {'pn_ds_meta' : {'stale' : true, 'last_update' : 0}, "data" : {}};


            // prepare the path argument
            if (path) {
                var split_array = path['split'](".");
                depth = split_array['length'];
            }

            /* 
                subscribe to 3 channels . for ex. if obj id is 'ab'
                a. normal channel       pn_ds_ab
                b. wildcard channel     pn_ds_ab.*
                c. transaction channel  pn_dstr_ab
            */
            SELF['subscribe']({

                'channel'     :   'pn_ds_' + object_id + ((path)?"." + path:'') + ','   +
                                'pn_ds_' + object_id + ((path)?"." + path:'') + '.*,' +
                                'pn_dstr_' + object_id,


                'connect'     : function(r, timetoken) {

                    // if message received on wild card channel
                    // this is just to take care of 3 invocations of connect
                    if (r == 'pn_ds_' + object_id + ((path)?"." + path:'') + '.*') {

                        // read initial copy of the data structure (recursive in case large object)
                        function read(next_page, callback, error) {
                            get({
                                'object_id' : object_id,
                                'path'      : path,
                                'timetoken' : timetoken,
                                'next_page'  : next_page,
                                'callback'  : function(r) {
                                    
                                    var next_page = r['next_page'];

                                    var payload = r['payload'];


                                    // if payload is object, merge else assign
                                    if (typeof payload === 'object') {
                                        internal['data'] = mergeAtOneLevel(internal['data'], payload);
                                    } else {
                                        internal['data'] = payload;
                                    }

                                    // till next_page is null in response keep reading recursively
                                    if (!next_page || (next_page && next_page == "null")) {

                                        // all updates recieved , now apply
                                        apply_all_updates(internal, updates, callback, depth);

                                        // sync complete
                                        synced = true;

                                        // invoke connect callback
                                        connect && connect(object_id);
                                    } else {
                                        // sync incomplete
                                        synced = false;

                                        // read more data
                                        read(next_page, callback, error);
                                    }

                                },
                                'error'     : function(r) {

                                   // error  
                                   error && error(r);
                                }
                            })
                        }

                        // start reading initial copy of object and populate internal copy
                        read();
                    } 
                },
                'callback'    : function(r) {

                    var trans_id    = r['trans_id'];
                    var action      = r['action'];
                    var status      = r['status'];

                    if (action) { // if action, store it in list with transaction id as key

                        if (!updates[trans_id])
                            updates[trans_id] = {'complete' : false, 'list' : []}
                        updates[trans_id]['list']['push'](r);

                    } else if (status) { // if transaction complete , apply the updates
                        if (status == 'complete' && updates[trans_id]) {
                            updates[trans_id]['complete'] = true;
                            if (synced) apply_updates(internal, updates, callback, trans_id, depth);
                        }
                    }
                },
                'error'       : function(r) { 

                    //error
                    err({'message' : r['message']});

                }
            });
            return internal;
        },

        'get' : function(args, callback) {
             var callback         = args['callback'] || callback
            ,   err              = args['error']    || function(){}
            ,   object_id        = args['object_id']
            ,   path             = args['path']
            ,   start_at         = args['start_at']
            ,   obj_at           = args['obj_at']
            ,   page_max_bytes   = args['page_max_bytes']
            ,   jsonp            = jsonp_cb()
            ,   auth_key         = args['auth_key'] || AUTH_KEY
            ,   data             = { 'uuid' : UUID, 'auth' : auth_key };

            // Make sure we have a Channel
            if (!object_id)     return error('Missing Object Id');
            if (!callback)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            var obj = null;
            function read(start_at,callback, error) {
                get({
                    'object_id' : object_id,
                    'path'      : path,
                    'start_at'  : start_at,
                    //'page_max_bytes' : 5,
                    'callback'  : function(r) {
                        if (obj == null && typeof r['payload'] !== 'object') {
                            callback && callback(r['payload']);
                            return;
                        }
                        obj = mergeAtOneLevel(obj,r['payload']); 
                        if (!r['next_page'] || (r['next_page'] && r['next_page'] == "null")) {
                            callback && callback(obj);
                        } else {
                            read(r['next_page'],callback, error);
                        }
                        
                    },
                    'error'     : error
                })
            }
            read(null,callback, error);
        },
        'set'   : function(args, callback) {
            args['mode'] = 'PUT'
            SELF['merge'](args);
        },
        'merge' : function(args, callback) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']    || function(){}
            ,   object_id        = args['object_id']
            ,   content          = args['data']
            ,   jsonp            = jsonp_cb()
            ,   auth_key         = args['auth_key'] || AUTH_KEY
            ,   data             = { 'uuid' : UUID, 'auth' : auth_key }
            ,   mode             = args['mode'] || 'PATCH'
            ,   path             = args['path'];

            // Make sure we have a Channel
            if (!object_id)     return error('Missing Object Id');
            if (!content)       return error('Missing Data');
            if (!callback)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');
            if (!PUBLISH_KEY)   return error('Missing Publish Key');


            var url = [
                STD_ORIGIN, 'v1', 'datasync','sub-key', SUBSCRIBE_KEY,
                 'pub-key', PUBLISH_KEY,'obj-id', encode(object_id)
            ];

            if (path) {
                url['push'](encode(path['split'](".")['join']("/")));
            }

            if (jsonp != '0') { data['callback'] = jsonp; }

            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                body     : JSON['stringify'](content),
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : url,
                mode  : mode
            });
        },
        'remove' : function(args, callback) {
            var callback         = args['callback'] || callback
            ,   err              = args['error']    || function(){}
            ,   jsonp            = jsonp_cb()
            ,   auth_key         = args['auth_key'] || AUTH_KEY
            ,   data             = { 'uuid' : UUID, 'auth' : auth_key }
            ,   object_id        = args['object_id']
            ,   path             = args['path'];

            // Make sure we have a Channel
            if (!object_id)     return error('Missing Object Id');
            if (!callback)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            var url = [
                STD_ORIGIN, 'v1', 'datasync','sub-key', SUBSCRIBE_KEY,
                 'pub-key', PUBLISH_KEY, 'obj-id', encode(object_id)
            ];
            
            if (path) {
                url['push'](encode(path['split'](".")['join']("/")));
            }

            if (jsonp != '0') { data['callback'] = jsonp; }

            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : url,
                mode : 'DELETE'
            });
        },
        'sync' : function(object_id) {
            console.log("SYNC  : " + object_id);
            function split_object_id_path(s) {
                var r = {};
                var object_id_split = s['split']('.');

                // prepare object

                r['object_id']          = object_id_split[0];
                object_id_split['shift']();
                r['path']            = object_id_split['join']('.');
                return r;
            }

            var ready, update, set, remove, change 
            ,   network_connect, network_disconnect, network_reconnect;

            // internal object that will reprepsent data
            var internal = {};

            // ref is the object reference that will be returned
            var ref = {

                // callbacks like change, ready etc can be set here
                'on' : {
                    'change'  : function(callback) {
                        change = callback;
                    },
                    'ready'  : function(callback) {
                        ready = callback;
                    },
                    'merge'  : function(callback) {
                        merge = callback;
                    },  
                    'replace'     : function(callback) {
                        replace = callback;
                    },
                    'remove'  : function(callback) {
                        remove = callback;
                    },
                    'error'   : function(callback) {
                        error = callback;
                    }, 
                    // network events
                    'network' : {
                        'connect'       : function(callback) {
                            network_connect = callback;
                        },
                        'disconnect'    : function(callback) {
                            network_disconnect = callback;
                        },
                        'reconnect'     : function(callback) {
                            network_reconnect = callback;
                        }
                    }
                }
            }

            var split_o = split_object_id_path(object_id);

            // prepare internal object 
            internal = SELF['get_synced_object']({
                'object_id'  : split_o['object_id'],
                'path'       : split_o['path'],
                'callback'   : function(r) {
                    console.log('GSO CALLBACK');    
                    console.log(JSON.stringify(r));
                    if (r[0]) {
                        var action = r[0]['action'];

                        change && change({'action' : action});

                        if (action === 'merge') {              // update event

                            merge && merge(ref);

                        } else if (action === 'delete') {       // delete event

                            remove && remove(ds_object);
                        }
                        else if (action === 'replace-delete') {     // set event
                            if (r[1] && r[1]['action'] == 'replace') { // set event confirmation
                                replace && replace(ref);
                            }
                        }
                    }
                },
                'error' : function(r) {
                    error && error(r);
                },
                'connect'    : function(r) {
                    network_connect && network_connect(r);
                    ready && ready(r);
                },
                'reconnect'  : function(r) {
                    network_reconnect && network_reconnect(r);
                },
                'disconnect' : function(r) {
                    network_disconnect && network_disconnect(r)
                }    
                
            });

            ref['value'] = function(path) {
                if (!path) return internal;
                var patha = path['split'](".");
                var d = internal;

                for (p in patha) {
                    var key = patha[p];
                    try {
                        if (d[key]) d = d[key]
                    } catch (e) {
                        return null;
                    }
                }

                return d;
            };

            ref['get'] = function(path) {
                return SELF['sync'](object_id + '.' + path);
            };

            return ref;
        },
        /*
            PUBNUB.history({
                channel  : 'my_chat_channel',
                limit    : 100,
                callback : function(history) { }
            });
        */
        'history' : function( args, callback ) {
            var callback         = args['callback'] || callback
            ,   count            = args['count']    || args['limit'] || 100
            ,   reverse          = args['reverse']  || "false"
            ,   err              = args['error']    || function(){}
            ,   auth_key         = args['auth_key'] || AUTH_KEY
            ,   cipher_key       = args['cipher_key']
            ,   channel          = args['channel']
            ,   start            = args['start']
            ,   end              = args['end']
            ,   include_token    = args['include_token']
            ,   params           = {}
            ,   jsonp            = jsonp_cb();

            // Make sure we have a Channel
            if (!channel)       return error('Missing Channel');
            if (!callback)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            params['stringtoken'] = 'true';
            params['count']       = count;
            params['reverse']     = reverse;
            params['auth']        = auth_key;

            if (jsonp) params['callback']              = jsonp;
            if (start) params['start']                 = start;
            if (end)   params['end']                   = end;
            if (include_token) params['include_token'] = 'true';

            // Send Message
            xdr({
                callback : jsonp,
                data     : _get_url_params(params),
                success  : function(response) {
                    if (typeof response == 'object' && response['error']) {
                        err({'message' : response['message'], 'payload' : response['payload']});
                        return;
                    }
                    var messages = response[0];
                    var decrypted_messages = [];
                    for (var a = 0; a < messages.length; a++) {
                        var new_message = decrypt(messages[a],cipher_key);
                        try {
                            decrypted_messages['push'](JSON['parse'](new_message));
                        } catch (e) {
                            decrypted_messages['push']((new_message));
                        }
                    }
                    callback([decrypted_messages, response[1], response[2]]);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : [
                    STD_ORIGIN, 'v2', 'history', 'sub-key',
                    SUBSCRIBE_KEY, 'channel', encode(channel)
                ]
            });
        },

        /*
            PUBNUB.replay({
                source      : 'my_channel',
                destination : 'new_channel'
            });
        */
        'replay' : function(args, callback) {
            var callback    = callback || args['callback'] || function(){}
            ,   auth_key    = args['auth_key'] || AUTH_KEY
            ,   source      = args['source']
            ,   destination = args['destination']
            ,   stop        = args['stop']
            ,   start       = args['start']
            ,   end         = args['end']
            ,   reverse     = args['reverse']
            ,   limit       = args['limit']
            ,   jsonp       = jsonp_cb()
            ,   data        = {}
            ,   url;

            // Check User Input
            if (!source)        return error('Missing Source Channel');
            if (!destination)   return error('Missing Destination Channel');
            if (!PUBLISH_KEY)   return error('Missing Publish Key');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            // Setup URL Params
            if (jsonp != '0') data['callback'] = jsonp;
            if (stop)         data['stop']     = 'all';
            if (reverse)      data['reverse']  = 'true';
            if (start)        data['start']    = start;
            if (end)          data['end']      = end;
            if (limit)        data['count']    = limit;

            data['auth'] = auth_key;

            // Compose URL Parts
            url = [
                STD_ORIGIN, 'v1', 'replay',
                PUBLISH_KEY, SUBSCRIBE_KEY,
                source, destination
            ];

            // Start (or Stop) Replay!
            xdr({
                callback : jsonp,
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function() { callback([ 0, 'Disconnected' ]) },
                url      : url,
                data     : _get_url_params(data)
            });
        },

        /*
            PUBNUB.auth('AJFLKAJSDKLA');
        */
        'auth' : function(auth) {
            AUTH_KEY = auth;
            CONNECT();
        },

        /*
            PUBNUB.time(function(time){ });
        */
        'time' : function(callback) {
            
            var jsonp = jsonp_cb();
            xdr({
                callback : jsonp,
                data     : _get_url_params({ 'uuid' : UUID, 'auth' : AUTH_KEY }),
                timeout  : SECOND * 5,
                url      : [STD_ORIGIN, 'time', jsonp],
                success  : function(response) { callback(response[0]) },
                fail     : function() { callback(0) }
            });
            
        },

        /*
            PUBNUB.publish({
                channel : 'my_chat_channel',
                message : 'hello!'
            });
        */
        'publish' : function( args, callback ) {
            var msg      = args['message'];
            if (!msg) return error('Missing Message');

            var callback = callback || args['callback'] || msg['callback'] || function(){}
            ,   channel  = args['channel'] || msg['channel']
            ,   auth_key = args['auth_key'] || AUTH_KEY
            ,   cipher_key = args['cipher_key']
            ,   err      = args['error'] || msg['error'] || function() {}
            ,   post     = args['post'] || false
            ,   store    = ('store_in_history' in args) ? args['store_in_history']: true
            ,   jsonp    = jsonp_cb()
            ,   add_msg  = 'push'
            ,   url;

            if (args['prepend']) add_msg = 'unshift'

            if (!channel)       return error('Missing Channel');
            if (!PUBLISH_KEY)   return error('Missing Publish Key');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            if (msg['getPubnubMessage']) {
                msg = msg['getPubnubMessage']();
            } 

            // If trying to send Object
            msg = JSON['stringify'](encrypt(msg, cipher_key));

            // Create URL
            url = [
                STD_ORIGIN, 'publish',
                PUBLISH_KEY, SUBSCRIBE_KEY,
                0, encode(channel),
                jsonp
            ];

            if (!post) url.push(encode(msg));

            params = { 'uuid' : UUID, 'auth' : auth_key }

            if (!store) params['store'] ="0"

            // Queue Message Send
            PUB_QUEUE[add_msg]({
                callback : jsonp,
                timeout  : SECOND * 5,
                url      : url,
                body     : (post)? msg: null,
                data     : _get_url_params(params),
                fail     : function(response){
                    _invoke_error(response, err);
                    publish(1);
                },
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                    publish(1);
                },
                mode     : (post)?'POST':'GET'
            });

            // Send Message
            publish();
        },

        /*
            PUBNUB.unsubscribe({ channel : 'my_chat' });
        */
        'unsubscribe' : function(args, callback) {
            var channel = args['channel']
            ,   callback      = callback            || args['callback'] || function(){}
            ,   err           = args['error']       || function(){};

            TIMETOKEN   = 0;
            //SUB_RESTORE = 1;    REVISIT !!!!

            // Prepare Channel(s)
            channel = map( (
                channel.join ? channel.join(',') : ''+channel
            ).split(','), function(channel) {
                if (!CHANNELS[channel]) return;
                return channel + ',' + channel + PRESENCE_SUFFIX;
            } ).join(',');

            // Iterate over Channels
            each( channel.split(','), function(channel) {
                var CB_CALLED = true;
                if (!channel) return;
                if (READY) {
                    CB_CALLED = SELF['LEAVE']( channel, 0 , callback, err);
                }
                if (!CB_CALLED) callback({action : "leave"});
                CHANNELS[channel] = 0;
                if (channel in STATE) delete STATE[channel];
            } );

            // Reset Connection if Count Less
            CONNECT();
        },

        /*
            PUBNUB.subscribe({
                channel  : 'my_chat'
                callback : function(message) { }
            });
        */
        'subscribe' : function( args, callback ) {
            var channel       = args['channel']
            ,   callback      = callback            || args['callback']
            ,   callback      = callback            || args['message']
            ,   auth_key      = args['auth_key']    || AUTH_KEY
            ,   connect       = args['connect']     || function(){}
            ,   reconnect     = args['reconnect']   || function(){}
            ,   disconnect    = args['disconnect']  || function(){}
            ,   errcb         = args['error']       || function(){}
            ,   idlecb        = args['idle']        || function(){}
            ,   presence      = args['presence']    || 0
            ,   noheresync    = args['noheresync']  || 0
            ,   backfill      = args['backfill']    || 0
            ,   timetoken     = args['timetoken']   || 0
            ,   sub_timeout   = args['timeout']     || SUB_TIMEOUT
            ,   windowing     = args['windowing']   || SUB_WINDOWING
            ,   state         = args['state']
            ,   heartbeat     = args['heartbeat'] || args['pnexpires']
            ,   restore       = args['restore'] || SUB_RESTORE;

            // Restore Enabled?
            SUB_RESTORE = restore;

            // Always Reset the TT
            TIMETOKEN = timetoken;

            // Make sure we have a Channel
            if (!channel)       return error('Missing Channel');
            if (!callback)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            if (heartbeat || heartbeat === 0) {
                SELF['set_heartbeat'](heartbeat);
            }

            // Setup Channel(s)
            each( (channel.join ? channel.join(',') : ''+channel).split(','),
            function(channel) {
                var settings = CHANNELS[channel] || {};

                // Store Channel State
                CHANNELS[SUB_CHANNEL = channel] = {
                    name         : channel,
                    connected    : settings.connected,
                    disconnected : settings.disconnected,
                    subscribed   : 1,
                    callback     : SUB_CALLBACK = callback,
                    'cipher_key' : args['cipher_key'],
                    connect      : connect,
                    disconnect   : disconnect,
                    reconnect    : reconnect
                };
                if (state) {
                    if (channel in state) {
                        STATE[channel] = state[channel];
                    } else {
                        STATE[channel] = state;
                    }
                }

                // Presence Enabled?
                if (!presence) return;

                // Subscribe Presence Channel
                SELF['subscribe']({
                    'channel'  : channel + PRESENCE_SUFFIX,
                    'callback' : presence,
                    'restore'  : restore
                });

                // Presence Subscribed?
                if (settings.subscribed) return;

                // See Who's Here Now?
                if (noheresync) return;
                SELF['here_now']({
                    'channel'  : channel,
                    'callback' : function(here) {
                        each( 'uuids' in here ? here['uuids'] : [],
                        function(uid) { presence( {
                            'action'    : 'join',
                            'uuid'      : uid,
                            'timestamp' : Math.floor(rnow() / 1000),
                            'occupancy' : here['occupancy'] || 1
                        }, here, channel ); } );
                    }
                });
            } );

            // Test Network Connection
            function _test_connection(success) {
                if (success) {
                    // Begin Next Socket Connection
                    timeout( CONNECT, SECOND );
                }
                else {
                    // New Origin on Failed Connection
                    STD_ORIGIN = nextorigin( ORIGIN, 1 );
                    SUB_ORIGIN = nextorigin( ORIGIN, 1 );

                    // Re-test Connection
                    timeout( function() {
                        SELF['time'](_test_connection);
                    }, SECOND );
                }

                // Disconnect & Reconnect
                each_channel(function(channel){
                    // Reconnect
                    if (success && channel.disconnected) {
                        channel.disconnected = 0;
                        return channel.reconnect(channel.name);
                    }

                    // Disconnect
                    if (!success && !channel.disconnected) {
                        channel.disconnected = 1;
                        channel.disconnect(channel.name);
                    }
                });
            }

            // Evented Subscribe
            function _connect() {
                var jsonp    = jsonp_cb()
                ,   channels = generate_channel_list(CHANNELS).join(',');

                // Stop Connection
                if (!channels) return;

                // Connect to PubNub Subscribe Servers
                _reset_offline();

                var data = _get_url_params({ 'uuid' : UUID, 'auth' : auth_key });

                var st = JSON.stringify(STATE);
                if (st.length > 2) data['state'] = JSON.stringify(STATE);

                if (PRESENCE_HB) data['heartbeat'] = PRESENCE_HB;

                start_presence_heartbeat();
                SUB_RECEIVER = xdr({
                    timeout  : sub_timeout,
                    callback : jsonp,
                    fail     : function(response) {
                        _invoke_error(response, errcb);
                        //SUB_RECEIVER = null;
                        SELF['time'](_test_connection);
                    },
                    data     : _get_url_params(data),
                    url      : [
                        SUB_ORIGIN, 'subscribe',
                        SUBSCRIBE_KEY, encode(channels),
                        jsonp, TIMETOKEN
                    ],
                    success : function(messages) {

                        //SUB_RECEIVER = null;
                        // Check for Errors
                        if (!messages || (
                            typeof messages == 'object' &&
                            'error' in messages         &&
                            messages['error']
                        )) {
                            errcb(messages['error']);
                            return timeout( CONNECT, SECOND );
                        }

                        // User Idle Callback
                        idlecb(messages[1]);

                        // Restore Previous Connection Point if Needed
                        TIMETOKEN = !TIMETOKEN               &&
                                    SUB_RESTORE              &&
                                    db['get'](SUBSCRIBE_KEY) || messages[1];

                        // Connect
                        each_channel(function(channel){
                            if (channel.connected) return;
                            channel.connected = 1;
                            channel.connect(channel.name, messages[1]);
                        });

                        if (RESUMED && !SUB_RESTORE) {
                                TIMETOKEN = 0;
                                RESUMED = false;
                                // Update Saved Timetoken
                                db['set']( SUBSCRIBE_KEY, 0 );
                                timeout( _connect, windowing );
                                return;
                        }

                        // Invoke Memory Catchup and Receive Up to 100
                        // Previous Messages from the Queue.
                        if (backfill) {
                            TIMETOKEN = 10000;
                            backfill  = 0;
                        }

                        // Update Saved Timetoken
                        db['set']( SUBSCRIBE_KEY, messages[1] );

                        // Route Channel <---> Callback for Message
                        var next_callback = (function() {
                            var channels = '';

                            if (messages.length > 3) {
                                channels = messages[3];
                            } else if (messages.length > 2) {
                                channels = messages[2];
                            } else {
                                channels = map(
                                generate_channel_list(CHANNELS), function(chan) { return map(
                                    Array(messages[0].length)
                                    .join(',').split(','),
                                    function() { return chan; }
                                ) }).join(',');
                            }   
                            var list = channels.split(',');

                            return function() {
                                var channel = list.shift()||SUB_CHANNEL;
                                return [
                                    (CHANNELS[channel]||{})
                                    .callback||SUB_CALLBACK,
                                    channel.split(PRESENCE_SUFFIX)[0]
                                ];
                            };
                        })();

                        var latency = detect_latency(+messages[1]);
                        each( messages[0], function(msg) {
                            var next = next_callback();
                            var decrypted_msg = decrypt(msg,
                                (CHANNELS[next[1]])?CHANNELS[next[1]]['cipher_key']:null);
                            next[0]( decrypted_msg, messages, next[1], latency);
                        });

                        timeout( _connect, windowing );
                    }
                });
            }

            CONNECT = function() {
                _reset_offline();
                timeout( _connect, windowing );
            };

            // Reduce Status Flicker
            if (!READY) return READY_BUFFER.push(CONNECT);

            // Connect Now
            CONNECT();
        },

        /*
            PUBNUB.here_now({ channel : 'my_chat', callback : fun });
        */
        'here_now' : function( args, callback ) {
            var callback = args['callback'] || callback
            ,   err      = args['error']    || function(){}
            ,   auth_key = args['auth_key'] || AUTH_KEY
            ,   channel  = args['channel']
            ,   jsonp    = jsonp_cb()
            ,   uuids    = ('uuids' in args) ? args['uuids'] : true
            ,   state    = args['state']
            ,   data     = { 'uuid' : UUID, 'auth' : auth_key };

            if (!uuids) data['disable_uuids'] = 1;
            if (state) data['state'] = 1;

            // Make sure we have a Channel
            if (!callback)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            var url = [
                    STD_ORIGIN, 'v2', 'presence',
                    'sub_key', SUBSCRIBE_KEY
                ];

            channel && url.push('channel') && url.push(encode(channel));

            if (jsonp != '0') { data['callback'] = jsonp; }

            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : url
            });
        },

        /*
            PUBNUB.current_channels_by_uuid({ channel : 'my_chat', callback : fun });
        */
        'where_now' : function( args, callback ) {
            var callback = args['callback'] || callback
            ,   err      = args['error']    || function(){}
            ,   auth_key = args['auth_key'] || AUTH_KEY
            ,   jsonp    = jsonp_cb()
            ,   uuid     = args['uuid']     || UUID
            ,   data     = { 'auth' : auth_key };

            // Make sure we have a Channel
            if (!callback)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');

            if (jsonp != '0') { data['callback'] = jsonp; }

            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : [
                    STD_ORIGIN, 'v2', 'presence',
                    'sub_key', SUBSCRIBE_KEY,
                    'uuid', encode(uuid)
                ]
            });
        },

        'state' : function(args, callback) {
            var callback = args['callback'] || callback || function(r) {}
            ,   err      = args['error']    || function(){}
            ,   auth_key = args['auth_key'] || AUTH_KEY
            ,   jsonp    = jsonp_cb()
            ,   state    = args['state']
            ,   uuid     = args['uuid'] || UUID
            ,   channel  = args['channel']
            ,   url
            ,   data     = _get_url_params({ 'auth' : auth_key });

            // Make sure we have a Channel
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');
            if (!uuid) return error('Missing UUID');
            if (!channel) return error('Missing Channel');

            if (jsonp != '0') { data['callback'] = jsonp; }

            if (CHANNELS[channel] && CHANNELS[channel].subscribed && state) STATE[channel] = state;

            data['state'] = JSON.stringify(state);

            if (state) {
                url      = [
                    STD_ORIGIN, 'v2', 'presence',
                    'sub-key', SUBSCRIBE_KEY,
                    'channel', encode(channel),
                    'uuid', uuid, 'data'
                ]
            } else {
                url      = [
                    STD_ORIGIN, 'v2', 'presence',
                    'sub-key', SUBSCRIBE_KEY,
                    'channel', encode(channel),
                    'uuid', encode(uuid)
                ]
            }

            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : url

            });

        },

        /*
            PUBNUB.grant({
                channel  : 'my_chat',
                callback : fun,
                error    : fun,
                ttl      : 24 * 60, // Minutes
                read     : true,
                write    : true,
                auth_key : '3y8uiajdklytowsj'
            });
        */
        'grant' : function( args, callback ) {
            var callback = args['callback'] || callback
            ,   err      = args['error']    || function(){}
            ,   channel  = args['channel']
            ,   obj_id   = args['object_id']
            ,   jsonp    = jsonp_cb()
            ,   ttl      = args['ttl']
            ,   r        = (args['read'] )?"1":"0"
            ,   w        = (args['write'])?"1":"0"
            ,   auth_key = args['auth_key'];

            if (!callback)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');
            if (!PUBLISH_KEY)   return error('Missing Publish Key');
            if (!SECRET_KEY)    return error('Missing Secret Key');

            var timestamp  = Math.floor(new Date().getTime() / 1000)
            ,   sign_input = SUBSCRIBE_KEY + "\n" + PUBLISH_KEY + "\n"
                    + "grant" + "\n";

            var data = {
                'w'         : w,
                'r'         : r,
                'timestamp' : timestamp
            };
            if (channel != 'undefined' && channel != null && channel.length > 0) data['channel'] = channel;
            if (obj_id != 'undefined' && obj_id != null && obj_id.length > 0) data['obj-id'] = obj_id;

            if (jsonp != '0') { data['callback'] = jsonp; }
            if (ttl || ttl === 0) data['ttl'] = ttl;

            if (auth_key) data['auth'] = auth_key;

            data = _get_url_params(data)

            if (!auth_key) delete data['auth'];

            sign_input += _get_pam_sign_input_from_params(data);

            var signature = hmac_SHA256( sign_input, SECRET_KEY );

            signature = signature.replace( /\+/g, "-" );
            signature = signature.replace( /\//g, "_" );

            data['signature'] = signature;

            xdr({
                callback : jsonp,
                data     : data,
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : [
                    STD_ORIGIN, 'v1', 'auth', 'grant' ,
                    'sub-key', SUBSCRIBE_KEY
                ]
            });
        },

        /*
            PUBNUB.audit({
                channel  : 'my_chat',
                callback : fun,
                error    : fun,
                read     : true,
                write    : true,
                auth_key : '3y8uiajdklytowsj'
            });
        */
        'audit' : function( args, callback ) {
            var callback = args['callback'] || callback
            ,   err      = args['error']    || function(){}
            ,   channel  = args['channel']
            ,   obj_id   = args['object_id']
            ,   auth_key = args['auth_key']
            ,   jsonp    = jsonp_cb();

            // Make sure we have a Channel
            if (!callback)      return error('Missing Callback');
            if (!SUBSCRIBE_KEY) return error('Missing Subscribe Key');
            if (!PUBLISH_KEY)   return error('Missing Publish Key');
            if (!SECRET_KEY)    return error('Missing Secret Key');

            var timestamp  = Math.floor(new Date().getTime() / 1000)
            ,   sign_input = SUBSCRIBE_KEY + "\n"
                + PUBLISH_KEY + "\n"
                + "audit" + "\n";

            var data = {'timestamp' : timestamp };
            if (jsonp != '0') { data['callback'] = jsonp; }
            if (channel != 'undefined' && channel != null && channel.length > 0) data['channel'] = channel;
            if (obj_id != 'undefined' && obj_id != null && obj_id.length > 0) data['obj-id'] = obj_id;
            if (auth_key) data['auth']    = auth_key;    

            data = _get_url_params(data)
            
            if (!auth_key) delete data['auth'];
            
            sign_input += _get_pam_sign_input_from_params(data);

            var signature = hmac_SHA256( sign_input, SECRET_KEY );

            signature = signature.replace( /\+/g, "-" );
            signature = signature.replace( /\//g, "_" );

            data['signature'] = signature;
            xdr({
                callback : jsonp,
                data     : data,
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) {
                    _invoke_error(response, err);
                },
                url      : [
                    STD_ORIGIN, 'v1', 'auth', 'audit' ,
                    'sub-key', SUBSCRIBE_KEY
                ]
            });
        },

        /*
            PUBNUB.revoke({
                channel  : 'my_chat',
                callback : fun,
                error    : fun,
                auth_key : '3y8uiajdklytowsj'
            });
        */
        'revoke' : function( args, callback ) {
            args['read']  = false;
            args['write'] = false;
            SELF['grant']( args, callback );
        },
        'set_uuid' : function(uuid) {
            UUID = uuid;
            CONNECT();
        },
        'get_uuid' : function() {
            return UUID;
        },
        'presence_heartbeat' : function(args) {
            var callback = args['callback'] || function() {}
            var err      = args['error']    || function() {}
            var jsonp    = jsonp_cb();
            var data     = { 'uuid' : UUID, 'auth' : AUTH_KEY };

            var st = JSON['stringify'](STATE);
            if (st.length > 2) data['state'] = JSON['stringify'](STATE);

            if (PRESENCE_HB > 0 && PRESENCE_HB < 320) data['heartbeat'] = PRESENCE_HB;

            if (jsonp != '0') { data['callback'] = jsonp; }
            
            xdr({
                callback : jsonp,
                data     : _get_url_params(data),
                timeout  : SECOND * 5,
                url      : [
                    STD_ORIGIN, 'v2', 'presence',
                    'sub-key', SUBSCRIBE_KEY,
                    'channel' , encode(generate_channel_list(CHANNELS, true)['join'](',')),
                    'heartbeat'
                ],
                success  : function(response) {
                    _invoke_callback(response, callback, err);
                },
                fail     : function(response) { _invoke_error(response, err); }
            });
        },

        // Expose PUBNUB Functions
        'xdr'           : xdr,
        'ready'         : ready,
        'db'            : db,
        'uuid'          : uuid,
        'map'           : map,
        'each'          : each,
        'each-channel'  : each_channel,
        'grep'          : grep,
        'offline'       : function(){_reset_offline(1, { "message":"Offline. Please check your network settings." })},
        'supplant'      : supplant,
        'now'           : rnow,
        'unique'        : unique,
        'updater'       : updater
    };

    function _poll_online() {
        _is_online() || _reset_offline( 1, {
            "error" : "Offline. Please check your network settings. "
        });
        timeout( _poll_online, SECOND );
    }

    function _poll_online2() {
        SELF['time'](function(success){
            detect_time_detla( function(){}, success );
            success || _reset_offline( 1, {
                "error" : "Heartbeat failed to connect to Pubnub Servers." +
                    "Please check your network settings."
                });
            timeout( _poll_online2, KEEPALIVE );
        });
    }

    function _reset_offline(err, msg) {
        SUB_RECEIVER && SUB_RECEIVER(err, msg);
        SUB_RECEIVER = null;
    }

    if (!UUID) UUID = SELF['uuid']();
    db['set']( SUBSCRIBE_KEY + 'uuid', UUID );

    //timeout( _poll_online,  SECOND    );
    //timeout( _poll_online2, KEEPALIVE );
    PRESENCE_HB_TIMEOUT = timeout( start_presence_heartbeat, ( PRESENCE_HB_INTERVAL - 3 ) * SECOND ) ;

    // Detect Age of Message
    function detect_latency(tt) {
        var adjusted_time = rnow() - TIME_DRIFT;
        return adjusted_time - tt / 10000;
    }

    detect_time_detla();
    function detect_time_detla( cb, time ) {
        var stime = rnow();

        time && calculate(time) || SELF['time'](calculate);

        function calculate(time) {
            if (!time) return;
            var ptime   = time / 10000
            ,   latency = (rnow() - stime) / 2;
            TIME_DRIFT = rnow() - (ptime + latency);
            cb && cb(TIME_DRIFT);
        }
    }

    return SELF;
}
