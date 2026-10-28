-- Local UAT application data is separate from automated test data.
CREATE DATABASE IF NOT EXISTS marketplace_uat CHARACTER SET utf8mb4;
GRANT ALL ON marketplace_uat.* TO 'marketplace_test'@'%';
