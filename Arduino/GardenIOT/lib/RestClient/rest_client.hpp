#ifndef REST_CLIENT_HPP
#define REST_CLIENT_HPP

#include <string>
#include <WiFiClientSecure.h>
#include <u8g2_stream.hpp>

class RestClient {
public:
    RestClient(U8G2Stream& u8g2Stream,      // Stream to send progress etc to
        WiFiClientSecure& client,           // Initialised and connected WifiClientSecure
        const std::string& hostname,        // DNS hostname of far end
        int32_t connectionTimeout = 5000);  // Timeout in ms

    bool post(const std::string& URL, const std::string& data, std::string& returnBody);

private:
    U8G2Stream& u8g2Stream;
    WiFiClientSecure& client;
    const std::string hostname;
    int32_t connectionTimeout;
};

#endif