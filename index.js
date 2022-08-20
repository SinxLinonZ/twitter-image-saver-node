require('dotenv').config();
const https = require('https');
const exiftool = require('node-exiftool')
const exiftoolBin = require('dist-exiftool')

process.env.root = __dirname;

const ImageSaver = require('./utils/ImageSaver');


// ImageSaver.saveTwitterImage("1560329379254652930");
// ImageSaver.saveTwitterImage("1559998238597730304");

// let url = "https://api.twitter.com/2/tweets/search/recent?query=from%3A__H_kys__&start_time=2022-08-13T09%3A00%3A00Z&max_results=100";
// https.get(url, {
//     headers: {
//         Authorization: "Bearer " + process.env.TWITTER_BEARER_TOKEN
//     }
// }, (res) => {
//     let body = '';
//     res.on('data', (chunk) => {
//         body += chunk;
//     }).on('end', () => {
//         let data = JSON.parse(body);
//         console.log(data);

//         for (const tweet of data.data) {
//             ImageSaver.saveTwitterImage(tweet.id);
//         }
//     }).on('error', (err) => {
//         console.log(err);
//     });
// });


const ep = new exiftool.ExiftoolProcess(exiftoolBin);
ep
  .open()
  // read directory
  .then(() => ep.readMetadata(process.env.root + "/saves", ['-File:all']))
  .then(console.log, console.error)
  .then(() => ep.close())
  .catch(console.error)