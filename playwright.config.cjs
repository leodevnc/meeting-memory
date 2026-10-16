const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./test/browser',workers:1,timeout:30000,
  use:{baseURL:'http://127.0.0.1:4184',viewport:{width:1440,height:1050},headless:true},
  webServer:{command:'PORT=4184 npm run dev',url:'http://127.0.0.1:4184',reuseExistingServer:false},
});
