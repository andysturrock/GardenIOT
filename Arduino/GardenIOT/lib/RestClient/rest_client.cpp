#include "rest_client.hpp"

RestClient::RestClient(U8G2Stream& u8g2Stream,
    WiFiClientSecure& client,
    const std::string& hostname,
    int32_t connectionTimeout) :
    u8g2Stream(u8g2Stream),
    client(client),
    hostname(hostname),
    connectionTimeout(connectionTimeout)
{
}

bool RestClient::post(const std::string& URL, std::string& returnBody) {
  // We do the DNS lookup here really for debugging and display purposes.
  IPAddress srv((uint32_t)0);
  if(!WiFiGenericClass::hostByName(hostname.c_str(), srv)) {
    u8g2Stream << "Cannot resolve " << hostname << " to IP Address" << flush;
    return false;
  }
  u8g2Stream << "Connecting to " << hostname << "..." << newline;
  u8g2Stream << "IP Address: " << srv.toString() << flush;

  // Now we have the IP address use that rather than hostname.
  // The hostname overload of this call does the same DNS lookup internally,
  // so that would be a waste of time.
  if (!client.connect(srv, 443, connectionTimeout)) {
    u8g2Stream << "Connection Failed" << flush;
  }
  else {
    u8g2Stream << "Connection made!" << newline;

    u8g2Stream << "POST" << newline << URL << flush;

    String data("[");
    data += "{\"sensor_id\": 0, \"temperature\": \"12.99\"},";
    data += "{\"sensor_id\": 1, \"temperature\": \"23.99\"},";
    data += "{\"sensor_id\": 2, \"temperature\": \"34.99\"}";
    data += "]";

    std::ostringstream http;
    http << "POST " << URL << " HTTP/1.1\n"
    << "Host: " << hostname << "\n"
    << "Connection: close\n"
    << "Content-Length: " << data.length() << "\n"
    << "\n"
    << data << "\n";
    client.print(http.str().c_str());
    unsigned long timeout = millis();
    while (client.available() == 0) {
      if (millis() - timeout > 10000) {
        u8g2Stream << "Client Timeout!" << flush;
        client.stop();
        return false;
      }
    }

    // Read the headers returned.
    while (client.connected()) {
      String line = client.readStringUntil('\n');
      Serial.print("line = ");
      Serial.println(line);
      if (line == "\r") {
        u8g2Stream << "Headers received" << flush;
        break;
      }
    }

    // Read the body returned
    std::string body;
    while (client.available()) {
      char c = client.read();
      // At end of response we seem to get a 255 so skip that.
      if(c == 255) {
        continue;
      }
      returnBody += c;
    }
    u8g2Stream << returnBody << flush;

    client.stop();

    return true;
  }
}