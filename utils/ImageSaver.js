const fs = require('fs');
const https = require('https');
const readline = require('readline');
const exiftool = require('node-exiftool')
const exiftoolBin = require('dist-exiftool')
const TwitterParser = require('./TwitterParser');

module.exports = {

    saveLikes: function (userId, nextToken = false, recursive = false) {
        const url = `https://api.twitter.com/2/users/${userId}/liked_tweets`;
        const query = nextToken ? `?pagination_token=${nextToken}` : "";
        https.get(url + query, {
            headers: {
                Authorization: "Bearer " + process.env.TWITTER_BEARER_TOKEN
            }
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            }).on('end', () => {
                let data = JSON.parse(body);

                const total = data.data.length;
                let counter = 0;
                for (const tweet of data.data) {
                    this.saveTwitterImage(tweet.id, recursive)
                        .then(() => {
                            counter++;
                            console.log(`${counter}/${total}`);
                            if (counter == total) {
                                const rl = readline.createInterface({
                                    input: process.stdin,
                                    output: process.stdout
                                });
                                rl.question("Fetch next page?[y/N] ", (answer) => {
                                    if (answer.toLowerCase() == "y") {
                                        this.saveLikes(userId, data.meta.next_token, true);
                                    }
                                    rl.close();
                                });
                            }
                        });
                }

            }).on('error', (err) => {
                console.log(err);
            });
        });
    },

    saveTwitterImage: function (tweetId, recursive = false) {
        const filter = {
            "tweet.fields": [
                "created_at",
                "entities",
            ].join(','),
            "expansions": [
                "attachments.media_keys",
                "author_id",
                "referenced_tweets.id"
            ].join(','),
            "media.fields": [
                "type",
                "url"
            ].join(','),
            "user.fields": [
                "name"
            ].join(','),
        };

        return new Promise((resolve, reject) => {
            TwitterParser.getTweet(tweetId, filter)
                .then(data => {

                    if (!data.includes) { resolve(); return; }
                    if (!data.includes.media) {
                        console.log("No media found");
                        resolve();
                        return;
                    }
                    if (data.errors || data.status == 429) {
                        console.log("Rate limit exceeded");
                        resolve();
                        return;
                    }

                    let retweet_flag = false;
                    if (data.data.referenced_tweets?.length > 0) {
                        for (const tweet of data.data.referenced_tweets) {
                            if (tweet.type == "retweeted") {
                                console.log("Retweet detected");
                                retweet_flag = true;
                                this.saveTwitterImage(tweet.id, recursive).then(resolve());
                                break;
                            }
                        }
                    }


                    if (!retweet_flag) {
                        for (const media of data.includes.media) {
                            if (media.type == "photo") {
                                // save photo
                                console.log(media.url + "?name=orig");
                                const fileName = media.url.split('/').pop();
                                const file = fs.createWriteStream(process.env.root + '/saves/' + fileName);
                                https.get(media.url + "?name=orig", (response) => {
                                    response.pipe(file).on('close', () => {
                                        console.log("Downloaded " + fileName);
                                        file.close();

                                        const ep = new exiftool.ExiftoolProcess(exiftoolBin);
                                        ep
                                            .open().then((pid) => console.log('Started exiftool process %s', pid))
                                            .then(() => {
                                                let StorylineIdentifier = [];
                                                if (data.data.referenced_tweets?.length > 0) {
                                                    for (const tweet of data.data.referenced_tweets) {
                                                        if (tweet.type == "replied_to") {
                                                            StorylineIdentifier.push(tweet.id);
                                                            if (recursive) {
                                                                console.log("Saving refrence: " + tweet.id);
                                                                this.saveTwitterImage(tweet.id, true);
                                                            }
                                                        }
                                                    }
                                                }

                                                ep.writeMetadata(process.env.root + '/saves/' + fileName, {
                                                    all: '',

                                                    "ArtworkDateCreated": data.data.created_at,
                                                    "ArtworkCreator": data.includes.users[0].name,
                                                    "ArtworkCreatorID": `@${data.includes.users[0].username}`,
                                                    "ArtworkContentDescription": data.data.text.split('\n').join('<br>'),
                                                    "ArtworkSource": data.data.id,
                                                    "StorylineIdentifier": StorylineIdentifier.length > 0 ?
                                                        StorylineIdentifier.join('<br>') : "none",
                                                    "GenreCvId+": data.data.entities.hashtags ?
                                                        data.data.entities.hashtags.map(hashtag => hashtag.tag).join("<br>") : "",

                                                }, ['overwrite_original', 'codedcharacterset=utf8'])
                                            })
                                            .then(null, console.error)
                                            // .then(() => ep.readMetadata(process.env.root + '/saves/' + fileName, ['-File:all']))
                                            // .then(console.log, console.error)
                                            .then(() => ep.close())
                                            .then(() => { resolve() })
                                            .catch(console.error)
                                    });
                                });
                            }
                        }
                    }
                });
        });
    }
}