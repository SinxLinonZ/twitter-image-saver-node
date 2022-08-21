const fs = require('fs');
const https = require('https');
const exiftool = require('node-exiftool')
const exiftoolBin = require('dist-exiftool')
const TwitterParser = require('./TwitterParser');

module.exports = {
    // todo: related tweets
    saveTwitterImageRecursive: function (tweetId) {

    },

    saveTwitterImage: function (tweetId) {
        const filter = {
            "tweet.fields": [
                "created_at"
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

        TwitterParser.getTweet(tweetId, filter)
            .then(data => {

                if (data.includes?.media?.length == 0) {
                    console.log("No media found");
                    return;
                }

                if (!data.includes.media) return;

                if (data.data.referenced_tweets?.length > 0 && data.data.referenced_tweets[0].type == "retweeted") {
                    this.saveTwitterImage(data.data.referenced_tweets[0].id);
                    console.log("Retweet detected");
                    return;
                }

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
                                    .then(() => ep.writeMetadata(process.env.root + '/saves/' + fileName, {
                                        all: '',

                                        "ArtworkDateCreated": data.data.created_at,
                                        "ArtworkCreator": data.includes.users[0].name,
                                        "ArtworkCreatorID": `@${data.includes.users[0].username}`,
                                        "ArtworkContentDescription": data.data.text.split('\n').join('<br>'),
                                        "ArtworkSource": data.data.id,
                                        "StorylineIdentifier": data.data.referenced_tweets?.length > 0 ? data.data.referenced_tweets[0].id : "",
                                        // "Description": data.data.text,

                                    }, ['overwrite_original', 'codedcharacterset=utf8']))
                                    .then(null, console.error)
                                    // .then(() => ep.readMetadata(process.env.root + '/saves/' + fileName, ['-File:all']))
                                    // .then(console.log, console.error)
                                    .then(() => ep.close())
                                    .catch(console.error)


                            });
                        });
                    }
                }

                
            });
    }
}