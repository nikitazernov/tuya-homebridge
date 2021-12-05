const BaseAccessory = require('./base_accessory')

let Accessory;
let Service;
let Characteristic;
let UUIDGen;

class RadiatorActuatorAccessory extends BaseAccessory {
  constructor(platform, homebridgeAccessory, deviceConfig) {

    ({ Accessory, Characteristic, Service } = platform.api.hap);
    super(
      platform,
      homebridgeAccessory,
      deviceConfig,
      Accessory.Categories.AIR_HEATER,
      Service.HeaterCooler
    );
    this.statusArr = deviceConfig.status;

    this.refreshAccessoryServiceIfNeed(this.statusArr, false);
  }

  //init Or refresh AccessoryService
  refreshAccessoryServiceIfNeed(statusArr, isRefresh) {
    this.isRefresh = isRefresh;

    // Global
    this.normalAsync(Characteristic.Active, 1)
    this.normalAsync(Characteristic.CurrentHeaterCoolerState, 2);
    this.normalAsync(Characteristic.TargetHeaterCoolerState, 1, {
      minValue: 1,
      maxValue: 1,
      validValues: [Characteristic.TargetHeaterCoolerState.HEAT]
    })

    for (var statusMap of statusArr) {
      
      if (statusMap.code === 'temp_current' || statusMap.code === 'temp_current_f') {
        this.temperatureMap = statusMap
        this.normalAsync(Characteristic.CurrentTemperature, this.temperatureMap.value, {
          minValue: -20,
          maxValue: 122,
          minStep: 1
        })

        this.normalAsync(Characteristic.TemperatureDisplayUnits, 0, {
          minValue: 0,
          maxValue: 0,
          validValues: [0]
        })
      }
      if (statusMap.code === 'temp_set' || statusMap.code === 'temp_set_f') {
        this.tempsetMap = statusMap

        if (!this.temp_set_range) {
          if (statusMap.code === 'temp_set') {
            this.temp_set_range = { 'min': 0, 'max': 50 }
          } else {
            this.temp_set_range = { 'min': 32, 'max': 104 }
          }
        }
        this.normalAsync(Characteristic.HeatingThresholdTemperature, this.tempsetMap.value, {
          minValue: this.temp_set_range.min,
          maxValue: this.temp_set_range.max,
          minStep: 1
        })
      }
    }
  }

  normalAsync(name, hbValue, props) {
    this.setCachedState(name, hbValue);
    if (this.isRefresh) {
      this.service
        .getCharacteristic(name)
        .updateValue(hbValue);
    } else {
      this.getAccessoryCharacteristic(name, props);
    }
  }

  getAccessoryCharacteristic(name, props) {
    //set  Accessory service Characteristic
    this.service.getCharacteristic(name)
      .setProps(props || {})
      .on('get', callback => {
        if (this.hasValidCache()) {
          callback(null, this.getCachedState(name));
        }
      })
      .on('set', (value, callback) => {
        if (name == Characteristic.TargetHeaterCoolerState || name == Characteristic.TemperatureDisplayUnits) {
          callback();
          return;
        }
        var param = this.getSendParam(name, value)
        this.platform.tuyaOpenApi.sendCommand(this.deviceId, param).then(() => {
          this.setCachedState(name, value);
          callback();
        }).catch((error) => {
          this.log.error('[SET][%s] Characteristic.Brightness Error: %s', this.homebridgeAccessory.displayName, error);
          this.invalidateCache();
          callback(error);
        });
      });
  }

  //get Command SendData
  getSendParam(name, value) {
    var code;
    var value;
    switch (name) {
      case Characteristic.Active:
        const isOn = value ? true : false;
        code = "switch";
        value = isOn;
        break;
      case Characteristic.HeatingThresholdTemperature:
        const tempset = value;
        //code = this.tempsetMap.code;
        code = "dummy!!!!!!"
        value = tempset;
        break;
      default:
        break;
    }
    return {
      "commands": [
        {
          "code": code,
          "value": value
        }
      ]
    };
  }

  //update device status
  updateState(data) {
    this.refreshAccessoryServiceIfNeed(data.status, true);
  }
}

module.exports = RadiatorActuatorAccessory;