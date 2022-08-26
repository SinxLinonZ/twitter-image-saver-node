const https = require('https');

module.exports = {
    getTweet: async function (tweetId, options) {
        let url = "https://api.twitter.com/2/tweets/" + tweetId;
        let query = "";
        if (options) {
            query = "?" + Object.keys(options).map(function (key) {
                return key + "=" + options[key];
            }).join("&");
        }
        const res = await new Promise((resolve, reject) => {
            https.get(url + query, {
                headers: {
                    Authorization: "Bearer " + process.env.TWITTER_BEARER_TOKEN
                }
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                }).on('end', () => {
                    resolve(body);
                }).on('error', (err) => {
                    reject(err);
                });
            });
        });

        return JSON.parse(res);
    }
}
