#ifndef TEMPERATURE_READING_HPP
#define TEMPERATURE_READING_HPP

#include <string>

class TemperatureReading {
private:
  int sensor_id;
  double temperature;
public:
  TemperatureReading(int sensor_id, double temperature) :
    sensor_id(sensor_id),
    temperature(temperature)
  {}

  std::string toJson() const;

  void fromJson(const std::string& json);
  
  int getSensorId() const;
  double getTemperature() const;
};

inline int TemperatureReading::getSensorId() const {
  return sensor_id;
}

inline double TemperatureReading::getTemperature() const {
  return temperature;
}

#endif // TEMPERATURE_READING_HPP