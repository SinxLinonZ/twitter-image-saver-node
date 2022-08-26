const fs = require('fs');
const https = require('https');
const readline = require('readline');
const exiftool = require('node-exiftool')
const exiftoolBin = require('dist-exiftool')
const TwitterParser = require('./TwitterParser');
const sharp = require('sharp');

module.exports = {

    saveLikes: async function (userId, nextToken = false, recursive = false) {
        const url = `https://api.twitter.com/2/users/${userId}/liked_tweets`;
        const query = nextToken ? `?pagination_token=${nextToken}` : "";
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
                });
            });
        });

        let data = JSON.parse(res);
        let total = data.data.length;
        for (let i = 0; i < data.data.length; i++) {
            const tweet = data.data[i];
            await this.saveTwitterImage(tweet.id, true);
            console.log(`${i}/${total}`);
        }

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

    },

    saveTwitterImage: async function (tweetId, recursive = false) {
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

        const data = await TwitterParser.getTweet(tweetId, filter);
        if (!data.includes) return;
        if (!data.includes.media) {
            console.log("No media found");
            return;
        }
        if (data.errors || data.status == 429) {
            console.log("Rate limit exceeded");
            return;
        }

        if (data.data.referenced_tweets?.length > 0) {
            for (let i = 0; i < data.data.referenced_tweets.length; i++) {
                const referencedTweet = data.data.referenced_tweets[i];
                if (referencedTweet.type == "retweeted") {
                    console.log("Retweet detected");
                    await this.saveTwitterImage(referencedTweet.id, recursive);
                    return;
                }
            }
        }


        for (let i = 0; i < data.includes.media.length; i++) {
            const media = data.includes.media[i];
            if (media.type == "photo") {
                // save photo
                console.log(media.url + "?name=orig");

                const fileName = media.url.split('/').pop();
                const savePath = process.env.root + '/saves/';
                if (!fs.existsSync(savePath)) {
                    fs.mkdirSync(savePath);
                }
                const file = fs.createWriteStream(savePath + fileName);
                await new Promise(async (resolve, reject) => {
                    https.get(media.url + "?name=orig", (response) => {
                        response.pipe(file).on('close', () => {
                            console.log("Downloaded " + fileName);
                            file.close();
                            resolve();
                        });
                    });
                });

                const thumbnailPath = process.env.root + '/saves/.thumbnails/';
                if (!fs.existsSync(thumbnailPath)) {
                    fs.mkdirSync(thumbnailPath);
                }
                const savedFile = fs.readFileSync(savePath + fileName);
                const buffer = await sharp(savedFile)
                    .resize(undefined, 224)
                    .toBuffer();
                fs.writeFileSync(thumbnailPath + ".thumbnail_" + fileName, buffer);

                console.log("Saved thumbnail " + fileName);

                let StorylineIdentifier = [];
                if (data.data.referenced_tweets?.length > 0) {
                    for await (const tweet of data.data.referenced_tweets) {
                        if (tweet.type == "replied_to") {
                            StorylineIdentifier.push(tweet.id);
                            if (recursive) {
                                console.log("Saving refrence: " + tweet.id);
                                await this.saveTwitterImage(tweet.id, true);
                            }
                        }
                    }
                }

                const ep = new exiftool.ExiftoolProcess(exiftoolBin);
                const pid = await ep.open();
                console.log('Started exiftool process %s', pid);
                await ep.writeMetadata(process.env.root + '/saves/' + fileName, {
                    all: '',

                    "ArtworkDateCreated": data.data.created_at,
                    "ArtworkCreator": data.includes.users[0].name,
                    "ArtworkCreatorID": `@${data.includes.users[0].username}`,
                    "ArtworkContentDescription": data.data.text.split('\n').join('<br>'),
                    "ArtworkSource": data.data.id,
                    "ArtworkSourceInventoryNo": i.toString(),
                    "StorylineIdentifier": StorylineIdentifier.length > 0 ?
                        StorylineIdentifier.join('<br>') : "none",
                    "GenreCvId+": data.data.entities.hashtags ?
                        data.data.entities.hashtags.map(hashtag => hashtag.tag).join("<br>") : "",

                }, ['overwrite_original', 'codedcharacterset=utf8']);
                await ep.close();

            }
        }
    }
}