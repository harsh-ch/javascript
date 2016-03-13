/* @flow */

import superagent from 'superagent';

import Keychain from './keychain.js';
import Responders from '../presenters/responders';
import Config from './config.js';
import utils from '../utils';

type commonXDR = { data: Object, callback: Function };
type typedXDR = { data: Object, success: Function, fail: Function, method: string };
type superagentPayload = { data: Object, url: Array<string | number>, callback: Function};

export default class {
  _sendBeacon: Function;
  _keychain: Keychain;
  _config: Config;

  _maxSubDomain: number;
  _currentSubDomain: number;

  _standardOrigin: string;
  _subscribeOrigin: string;

  _providedFQDN: string;

  _requestTimeout: number;

  _coreParams: Object; /* items that must be passed with each request. */

  _r: Responders;

  constructor(config: Config, keychain: Keychain, ssl: boolean = false, origin: ?string = 'pubsub.pubnub.com') {
    this._config = config;
    this._keychain = keychain;
    this._r = new Responders('#networking');

    this._maxSubDomain = 20;
    this._currentSubDomain = Math.floor(Math.random() * this._maxSubDomain);

    this._providedFQDN = (ssl ? 'https://' : 'http://') + origin;
    this._coreParams = {};

    // create initial origins
    this.shiftStandardOrigin(false);
    this.shiftSubscribeOrigin(false);
  }

  setCoreParams(params: Object): this {
    this._coreParams = params;
    return this;
  }

  addCoreParam(key: string, value: any) {
    this._coreParams[key] = value;
  }

  addBeaconDispatcher(sendBeacon: Function): this {
    this._sendBeacon = sendBeacon;
    return this;
  }

  /*
    Fuses the provided endpoint specific params (from data) with instance params
  */
  prepareParams(data: Object): Object {
    if (!data) data = {};

    utils.each(this._coreParams, function (key, value) {
      if (!(key in data)) data[key] = value;
    });

    if (this._config.isInstanceIdEnabled()) {
      data.instanceid = this._keychain.getInstanceId();
    }

    return data;
  }

  nextOrigin(failover: boolean): string {
    // if a custom origin is supplied, use do not bother with shuffling subdomains
    if (this._providedFQDN.indexOf('pubsub.') === -1) {
      return this._providedFQDN;
    }

    let newSubDomain: string;

    if (failover) {
      newSubDomain = utils.generateUUID().split('-')[0];
    } else {
      this._currentSubDomain = this._currentSubDomain + 1;

      if (this._currentSubDomain >= this._maxSubDomain) { this._currentSubDomain = 1; }

      newSubDomain = this._currentSubDomain.toString();
    }

    return this._providedFQDN.replace('pubsub', 'ps' + newSubDomain);
  }

  // origin operations
  shiftStandardOrigin(failover: boolean = false): string {
    this._standardOrigin = this.nextOrigin(failover);

    return this._standardOrigin;
  }

  shiftSubscribeOrigin(failover: boolean = false): string {
    this._subscribeOrigin = this.nextOrigin(failover);

    return this._subscribeOrigin;
  }

  // method based URL's
  fetchHistory(channel: string, incomingData: Object, callback: Function) {
    if (!this._keychain.getSubscribeKey()) {
      return callback(this._r.validationError('Missing Subscribe Key'));
    }

    let url = [
      this.getStandardOrigin(), 'v2', 'history', 'sub-key',
      this._keychain.getSubscribeKey(), 'channel', utils.encode(channel),
    ];

    let data = this.prepareParams(incomingData);

    if (this._keychain.getAuthKey()) {
      data.auth = this._keychain.getAuthKey();
    }

    this._xdr({ data, callback, url });
  }

  performChannelGroupOperation(channelGroup: string, mode: string, { data, success, fail }: commonXDR) {
    let url = [
      this.getStandardOrigin(), 'v1', 'channel-registration',
      'sub-key', this._keychain.getSubscribeKey(), 'channel-group',
    ];

    if (channelGroup && channelGroup !== '*') {
      url.push(channelGroup);
    }

    if (mode === 'remove') {
      url.push('remove');
    }

    this._xdr({ data, success, fail, url });
  }

  provisionDeviceForPush(deviceId: string, data: Object): Q.Promise {
    let url = [
      this.getStandardOrigin(), 'v1', 'push', 'sub-key',
      this._keychain.getSubscribeKey(), 'devices', deviceId,
    ];

    data.uuid = this._keychain.getUUID();
    data.auth = this._keychain.getAuthKey();

    return this._xdr({ data, url });
  }

  performGrant({ data, success, fail }: commonXDR) {
    let url = [
      this.getStandardOrigin(), 'v1', 'auth', 'grant',
      'sub-key', this._keychain.getSubscribeKey(),
    ];

    this._xdr({ data, success, fail, url });
  }

  performHeartbeat(channels: string, { data, success, fail }: commonXDR) {
    let url = [
      this.getStandardOrigin(), 'v2', 'presence',
      'sub-key', this._keychain.getSubscribeKey(),
      'channel', channels,
      'heartbeat',
    ];

    this._xdr({ data, success, fail, url });
  }

  performState(state: string, channel: string, uuid: string, { data, success, fail }: commonXDR) {
    let url = [
      this.getStandardOrigin(), 'v2', 'presence',
      'sub-key', this._keychain.getSubscribeKey(),
      'channel', channel,
    ];

    if (state) {
      url.push('uuid', uuid, 'data');
    } else {
      url.push('uuid', utils.encode(uuid));
    }

    this._xdr({ data, success, fail, url });
  }

  performAudit({ data, success, fail }: commonXDR) {
    let url = [
      this.getStandardOrigin(), 'v1', 'auth', 'audit',
      'sub-key', this._keychain.getSubscribeKey(),
    ];

    this._xdr({ data, success, fail, url });
  }

  performChannelLeave(channel: string, { data, success, fail }: commonXDR) {
    let origin = this.nextOrigin(false);
    let url = [
      origin, 'v2', 'presence', 'sub_key',
      this._keychain.getSubscribeKey(), 'channel', utils.encode(channel), 'leave',
    ];

    if (this._sendBeacon) {
      if (this._sendBeacon(utils.buildURL(url, data))) {
        success({ status: 200, action: 'leave', message: 'OK', service: 'Presence' });
      }
    } else {
      this._xdr({ data, success, fail, url });
    }
  }

  performChannelGroupLeave({ data, success, fail }: commonXDR) {
    let origin = this.nextOrigin(false);
    let url = [
      origin, 'v2', 'presence', 'sub_key',
      this._keychain.getSubscribeKey(), 'channel', utils.encode(','), 'leave',
    ];

    if (typeof(this._sendBeacon) !== 'undefined') {
      if (this._sendBeacon(utils.buildURL(url, data))) {
        success({ status: 200, action: 'leave', message: 'OK', service: 'Presence' });
      }
    } else {
      this._xdr({ data, success, fail, url });
    }
  }

  fetchReplay(source: string, destination: string, { data, success, fail }: commonXDR) {
    let url = [
      this.getStandardOrigin(), 'v1', 'replay',
      this._keychain.getPublishKey(), this._keychain.getSubscribeKey(), source, destination,
    ];

    this._xdr({ data, success, fail, url });
  }

  fetchTime(callback: Function) {
    let data = this.prepareParams({});
    let url = [this.getStandardOrigin(), 'time', 0];

    if (this._keychain.getUUID()) {
      data.uuid = this._keychain.getUUID();
    }

    if (this._keychain.getAuthKey()) {
      data.auth = this._keychain.getAuthKey();
    }

    this._xdr({ data, callback, url });
  }

  fetchWhereNow(uuid: string, { data, success, fail }: commonXDR) {
    let url = [
      this.getStandardOrigin(), 'v2', 'presence',
      'sub_key', this._keychain.getSubscribeKey(),
      'uuid', utils.encode(uuid),
    ];

    this._xdr({ data, success, fail, url });
  }

  fetchHereNow(channel: string, channelGroup: string, { data, success, fail }: commonXDR) {
    let url = [
      this.getStandardOrigin(), 'v2', 'presence',
      'sub_key', this._keychain.getSubscribeKey(),
    ];

    if (channel) {
      url.push('channel');
      url.push(utils.encode(channel));
    }

    if (channelGroup && !channel) {
      url.push('channel');
      url.push(',');
    }

    this._xdr({ data, success, fail, url });
  }

  performPublish(channel: string, msg: string, { data, callback, success, fail, mode }: typedXDR) {
    let url = [
      this.getStandardOrigin(), 'publish',
      this._keychain.getPublishKey(), this._keychain.getSubscribeKey(),
      0, utils.encode(channel),
      0, utils.encode(msg),
    ];

    this._xdr({ data, callback, success, fail, url, mode });
  }

  getOrigin(): string {
    return this._providedFQDN;
  }

  getStandardOrigin(): string {
    return this._standardOrigin;
  }

  getSubscribeOrigin(): string {
    return this._subscribeOrigin;
  }

  _xdr({ data, url, callback}: superagentPayload) {
    superagent
      .get(url.join('/'))
      .query(data)
      .type('json')
      // .timeout(this._requestTimeout)
      .end(function (err, resp) {
        if (err) return callback(err, null);

        if (typeof resp === 'object' && resp.error) {
          callback(resp.error, null);
          return;
        }

        callback(null, JSON.parse(resp.text));
      });
  }

}