const TuyaOpenAPI = require("./lib/tuyaopenapi");
const TuyaSHOpenAPI = require("./lib/tuyashopenapi");
const TuyaOpenMQ = require("./lib/tuyamqttapi");
const OutletAccessory = require('./lib/outlet_accessory');
const LightAccessory = require('./lib/light_accessory');
const SwitchAccessory = require('./lib/switch_accessory');
const SmokeSensorAccessory = require('./lib/smokesensor_accessory');
const Fanv2Accessory = require('./lib/fanv2_accessory');
const HeaterAccessory = require('./lib/heater_accessory');
const GarageDoorAccessory = require('./lib/garagedoor_accessory');
const AirPurifierAccessory = require('./lib/air_purifier_accessory')

var Accessory, Service, Characteristic;

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  // registerAccessory' three parameters is plugin-name, accessory-name, constructor-name
  homebridge.registerPlatform('homebridge-tuya-platform', 'TuyaPlatform', TuyaPlatform, true);
}

// Accessory constructor
class TuyaPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    if (!config || !config.options) {
      this.log('No config found, disabling plugin.')
      return;
    }
    this.deviceAccessories = new Map();
    this.accessories = new Map();

    if (api) {
      // Save the API object as plugin needs to register new accessory via this object
      this.api = api;
      // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
      // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
      // Or start discover new accessories.
      this.api.on('didFinishLaunching', function () {
        this.log("Initializing TuyaPlatform...");
        this.initTuyaSDK(config);
      }.bind(this));
    }
  }

  async initTuyaSDK(config) {
    let devices
    let api
    if (config.options.projectType == '1') {
      console.log("TuyaOpenAPI")
      api = new TuyaOpenAPI(
        config.options.endPoint,
        config.options.accessId,
        config.options.accessKey,
      );
      this.tuyaOpenApi = api;
      //login before everything start
      await api.login(config.options.username, config.options.password);
      //init Mqtt service and register some Listener
      devices = await api.getDeviceList();
      console.log("TuyaOpenAPI getDevices",devices)
    } else {
      api = new TuyaSHOpenAPI(
        config.options.endPoint,
        config.options.accessId,
        config.options.accessKey,
        config.options.username,
        config.options.password,
        config.options.countryCode,
        config.options.appSchema,
      );
      this.tuyaOpenApi = api;

      devices = await api.getDevices()
      console.log("TuyaOpenAPI getDevices",devices)
      let func = await api.getDeviceFunctions('6cb2c761afc1e455d3rakk')
      console.log("TuyaOpenAPI getDeviceFunctions",func)
      // await api.authRequest(config.options.username, config.options.password, config.options.countryCode, config.opti)
    }
    const type = config.options.projectType == "1" ? "2.0" : "1.0"
    let mq = new TuyaOpenMQ(api, type);
    this.tuyaOpenMQ = mq;
    this.tuyaOpenMQ.start();
    this.tuyaOpenMQ.addMessageListener(this.onMQTTMessage.bind(this));

    for (const device of devices) {
      this.addAccessory(device);
    }
  }

  addAccessory(device) {
    var deviceType = device.category || 'dj';
    this.log.info('Adding: %s (%s / %s)', device.name || 'unnamed', deviceType, device.id);
    // Get UUID
    const uuid = this.api.hap.uuid.generate(device.id);
    const homebridgeAccessory = this.accessories.get(uuid);

    // Is device type overruled in config defaults?
    if (this.config.defaults) {
      for (const def of this.config.defaults) {
        if (def.id === device.id) {
          deviceType = def.device_type || deviceType;
          this.log('Device type is overruled in config to: ', deviceType);
        }
      }
    }

    // Construct new accessory
    let deviceAccessory;
    switch (deviceType) {
      case 'kj':
        deviceAccessory = new AirPurifierAccessory(this, homebridgeAccessory, device);
        this.accessories.set(uuid, deviceAccessory.homebridgeAccessory);
        this.deviceAccessories.set(uuid, deviceAccessory);
        break;
      case 'dj':
      case 'dd':
      case 'fwd':
        deviceAccessory = new LightAccessory(this, homebridgeAccessory, device);
        this.accessories.set(uuid, deviceAccessory.homebridgeAccessory);
        this.deviceAccessories.set(uuid, deviceAccessory);
        break;
      case 'cz':
        deviceAccessory = new OutletAccessory(this, homebridgeAccessory, device);
        this.accessories.set(uuid, deviceAccessory.homebridgeAccessory);
        this.deviceAccessories.set(uuid, deviceAccessory);
        break;
      case 'kg':
        deviceAccessory = new SwitchAccessory(this, homebridgeAccessory, device);
        this.accessories.set(uuid, deviceAccessory.homebridgeAccessory);
        this.deviceAccessories.set(uuid, deviceAccessory);
        break;
      case 'fs':
        deviceAccessory = new Fanv2Accessory(this, homebridgeAccessory, device);
        this.accessories.set(uuid, deviceAccessory.homebridgeAccessory);
        this.deviceAccessories.set(uuid, deviceAccessory);
        break;
      case 'ywbj':
        deviceAccessory = new SmokeSensorAccessory(this, homebridgeAccessory, device);
        this.accessories.set(uuid, deviceAccessory.homebridgeAccessory);
        this.deviceAccessories.set(uuid, deviceAccessory);
        break;
      case 'qn':
        deviceAccessory = new HeaterAccessory(this, homebridgeAccessory, device);
        this.accessories.set(uuid, deviceAccessory.homebridgeAccessory);
        this.deviceAccessories.set(uuid, deviceAccessory);
        break;
      case 'ckmkzq': //garage_door_opener
        deviceAccessory = new GarageDoorAccessory(this, homebridgeAccessory, device);
        this.accessories.set(uuid, deviceAccessory.homebridgeAccessory);
        this.deviceAccessories.set(uuid, deviceAccessory);
        break;
      default:
        break;
    }

  }

  //Handle device deletion, addition, status update
  async onMQTTMessage(message){
    if(message.bizCode){
      if(message.bizCode == 'delete'){
        const uuid = this.api.hap.uuid.generate(message.devId);
        const homebridgeAccessory = this.accessories.get(uuid);
        this.removeAccessory(homebridgeAccessory)
      }else if(message.bizCode == 'bindUser'){
        let deviceInfo = await this.tuyaOpenApi.getDeviceInfo(message.bizData.devId)
        let functions = await this.tuyaOpenApi.getDeviceFunctions(message.bizData.devId)
        this.log('accessory  bindUser functions', functions);
        let device = Object.assign(deviceInfo, functions);
        this.addAccessory(device) 
        this.log('accessory getDeviceInfo', device);
      }
    }else{
      this.refreshDeviceStates(message)
    }
  }

  //refresh Accessorie status
  async refreshDeviceStates(message) {
    const uuid = this.api.hap.uuid.generate(message.devId);
    const deviceAccessorie = this.deviceAccessories.get(uuid);
    if (deviceAccessorie) {
      let functions = await this.tuyaOpenApi.getDeviceFunctions(message.devId)
      this.log('accessory  refreshDeviceStates functions', functions);
      let device = Object.assign(message, functions);
      deviceAccessorie.updateState(device);
      this.log('accessory refreshDeviceStates', device);
    }
    else {
      this.log.error('Could not find accessory in dictionary');
    }
  }

  // Called from device classes
  registerPlatformAccessory(platformAccessory) {
    // this.log.debug('Register Platform Accessory (%s)', platformAccessory.displayName);
    this.api.registerPlatformAccessories('homebridge-tuya-platform', 'TuyaPlatform', [platformAccessory]);
  }

  // Function invoked when homebridge tries to restore cached accessory.
  // Developer can configure accessory at here (like setup event handler).
  // Update current value.
  configureAccessory(accessory) {
    this.log("Configuring cached accessory [%s]", accessory.displayName, accessory.context.deviceId, accessory.UUID);
    // Set the accessory to reachable if plugin can currently process the accessory,
    // otherwise set to false and update the reachability later by invoking
    // accessory.updateReachability()
    accessory.reachable = true;
    accessory.on('identify', function (paired, callback) {
      // this.log.debug('[IDENTIFY][%s]', accessory.displayName);
      callback();
    });
    this.accessories.set(accessory.UUID, accessory);
  }

  // Sample function to show how developer can remove accessory dynamically from outside event
  removeAccessory(accessory) {
    this.log("Remove Accessory [%s]", accessory);
    this.api.unregisterPlatformAccessories("homebridge-tuya-platform", "TuyaPlatform", [accessory]);
    this.accessories.delete(accessory.uuid);
    this.deviceAccessories.delete(accessory.uuid);
  }
}