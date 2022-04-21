const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
const BASE_URL = 'https://freewebnovel.com/latest-release-novel/';
const request = require('request');
const Chapter = require('../models/chapter');
var userAgent = require('user-agents');
const { Readable } = require('stream');
const Novel = require('../models/novel');
var fs = require('fs')
const ftp = require("basic-ftp");
const axios = require('axios');
let novelIds = [];
class NovelCrawlerService {
    constructor() {}

    async getComics(_page) {

        let result = await commicsCrawler(_page);
        return result;
    }

    async getChapterDetail(link) {
        let result = getChapterDetail(link);
        return result;
    }

}

let writeLog = function(msg) {
    fs.appendFile('./log.txt', `${msg} \r\n`, function(err) {
        if (err) {
            // append failed
        } else {
            // done
        }
    })
}
let bufferToStream = function(binary) {
    const readableInstanceStream = new Readable({
        read() {
            this.push(binary);
            this.push(null);
        }
    });
    return readableInstanceStream;
}
let getDataFromUrlImage = function(url) {
    return new Promise(function(reslove, reject) {
        var options = {
            url: url,
            encoding: null
        }
        request.get(options, async function(err, res, body) {
            let data = bufferToStream(body)
            reslove(data);
        });
    })
}

let download_banner = async function(comic_victim_url, file_name) {
    const client = new ftp.Client(10000)
    client.ftp.verbose = true
    try {
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            //secure: true,
            port: 21
        });
        let data = await getDataFromUrlImage(comic_victim_url);
        await client.uploadFrom(data, `image_service/public/novel/${file_name}.jpg`);
        const request = require('request');
        request(`http://${process.env.FTP_HOST}:6200/resizeImage/${file_name}.jpg`, { json: true }, (err, res, body) => {
            if (!err) {
                console.log(" Nhan doi anh thanh cong");
            }
        });
        console.log("REPLACE BANNER DONE");
    } catch (err) {
        console.log("Dowload banner loi")
        console.log(err)
    }
    client.close()
};

let commicsCrawler = async function(page_index = 1) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-profile', '--disable-web-security'],
        timeout: 90000

    });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    await page.setDefaultNavigationTimeout(300000);
    // await page.waitForNavigation({ waitUntil: 'networkidle2' });
    // page.on("request", request => {
    //         if (request.resourceType() === "script") {
    //             request.abort()
    //         } else {
    //             request.continue()
    //         }
    //     })

    page.on('request', (req) => {
        if (req.resourceType() == 'stylesheet' || req.resourceType() == 'font' || req.resourceType() == 'image' || req.resourceType() === "script") {
            req.abort();
        } else {
            req.continue();
        }
    });
    //   page.on('console', consoleObj => console.log(consoleObj.text()));
    try {
        console.log(`${BASE_URL}${page_index}`)
        await page.goto(`${BASE_URL}${page_index}`);
        let novelUrls = await page.evaluate(() => {
            let results = [];
            const novelUrls = document.querySelectorAll('.ss-custom .li-row .li');
            novelUrls.forEach((novel) => {
                let novelItem = {};
                try {
                    novelItem['novel_victim_url'] = novel.querySelector('h3.tit a').href;
                } catch (err) {
                    console.log(err)
                }
                results.push(novelItem);
            });
            return results;
        });
        for (let i = 0; i < novelUrls.length; i++) {
            const novelUrl = novelUrls[i].novel_victim_url;
            if (!novelIds.includes(novelUrl)) {
                novelIds.push(novelUrl);
                await page.goto(novelUrl, { timeout: 200000 });
                let novelInfo = await page.evaluate(async() => {

                    const novel_victim_banner = document.querySelector('.m-imgtxt .pic img').src || '';
                    const novel_name = document.querySelector(".m-desc h1.tit").innerText || '';
                    let novel_other_name = '';
                    let novel_author = '';
                    let novel_status = 1;
                    let novel_genres = [];
                    let novel_source = '';
                    let temp = novel_victim_banner.split("/");
                    let novel_victim_id = temp[temp.length - 1].replace("s.jpg", "");
                    let isHot = (document.querySelector(".m-newest .col-l ul li:first-child .item span") && document.querySelector(".m-newest .col-l ul li:first-child .item span").innerText == 'HOT') ? true : false;
                    let isNew = (document.querySelector(".m-newest .col-l ul li:first-child .item span") && document.querySelector(".m-newest .col-l ul li:first-child .item span").innerText == 'NEW') ? true : false;

                    let meta_info = document.querySelectorAll('.m-imgtxt .txt .item');
                    meta_info.forEach(meta_item => {
                        if (meta_item.querySelector('span.glyphicon').title.trim() == 'Alternative names') {
                            novel_other_name = meta_item.querySelector('.right span') ? meta_item.querySelector('.right span').innerText.trim() : '';
                        }
                        if (meta_item.querySelector('span.glyphicon').title.trim() == 'Author') {
                            novel_author = meta_item.querySelector('.right a') ? meta_item.querySelector('.right a').innerText.trim() : '';
                        }
                        if (meta_item.querySelector('span.glyphicon').title.trim() == 'Source') {
                            novel_source = meta_item.querySelector('.right span') ? meta_item.querySelector('.right span').innerText.trim() : '';
                        }
                        if (meta_item.querySelector('span.glyphicon').title.trim() == 'Status') {
                            if (meta_item.querySelector('a').innerText.trim() == 'OnGoing') {
                                novel_status = 0;
                            }
                        }
                        if (meta_item.querySelector('span.glyphicon').title.trim() == 'Genre') {
                            let genresContainer = meta_item.querySelectorAll('a');
                            genresContainer.forEach(genreItem => {
                                let genreId = genreItem.innerText.toUpperCase().trim();
                                novel_genres.push(genreId);
                            });
                        }
                    });
                    const novel_desc = document.querySelector('.m-desc .txt .inner').innerText;
                    let avgPointType2 = 7;
                    let voteCountType2 = 35;
                    let votes = document.querySelector('.score .vote').innerText;
                    if (votes.includes('votes')) {
                        avgPointType2 = Number(votes.split('/')[0]) * 2;
                        voteCountType2 = Number(votes.split('(')[1].replace(/\D/g, ''));
                    }

                    return {
                        novel_victim_banner: novel_victim_banner,
                        novel_author: novel_author,
                        novel_source: novel_source,
                        novel_victim_id: novel_victim_id,
                        novel_other_name: novel_other_name,
                        novel_status: novel_status,
                        novel_genres: novel_genres,
                        novel_desc: novel_desc,
                        avgPointType2: avgPointType2,
                        voteCountType2: voteCountType2,
                        novel_name: novel_name,
                        hot: isHot,
                        new: isNew
                    };
                });
                novelInfo['novel_id'] = novelUrl.match(/.*\/(.*)$/)[1].replace('.html', '').trim();
                novelInfo['onDb'] = true;
                let novel_on_db = await checkNovelExits(novelInfo['novel_name'].trim(), novelInfo['novel_id']);

                if (novel_on_db) {
                    novelInfo['novel_id'] = novel_on_db.novel_id;
                }
                const chapter_url = `https://freewebnovel.com/api/chapterlist.php?aid=${novelInfo['novel_victim_id']}&acode=${novelUrl.match(/.*\/(.*)$/)[1].replace('.html', '').trim()}&cid=1`
                await page.goto(chapter_url);
                let chapters = await page.evaluate(async() => {
                    let chapters = [];
                    let chapterContainers = document.querySelectorAll('option');
                    chapterContainers.forEach(chapterItem => {
                        let chapterUrl = chapterItem.value.replaceAll('"', '').replaceAll('\\', '');
                        let chapterName = chapterItem.label.replace(`?C.`, '').replace('C.', '').replace("<\\/option>", '').trim();
                        chapters.push({
                            chapter_url: `https://freewebnovel.com` + chapterUrl,
                            chapter_name: chapterName.replace(`"}`, '')
                        })
                    });
                    return chapters;
                })
                novelInfo['chapters'] = chapters;
                novelInfo['crawler_date'] = new Date();
                novelInfo['totalChapter'] = chapters.length;

                Novel.create(novelInfo, function(err, data) {
                    if (!err) {
                        if (novelInfo.novel_victim_banner) {
                            const file_name = novelInfo['novel_id'];
                            download_banner(novelInfo.novel_victim_banner, file_name);
                        }
                        console.log(`Page ${page_index} - Them thanh cong novel ${novelInfo.novel_name}`)
                    } else {
                        console.log(`Thong bao ${novelInfo.novel_name} da ton tai`);
                        Novel.updateOne({ novel_id: novelInfo['novel_id'] }, {
                            hot: novelInfo['hot'],
                            new: novelInfo['new'],
                            totalChapter: novelInfo.chapters.length,
                            novel_status: novelInfo['novel_status']
                        }, function(err, res) {
                            if (!err) {
                                console.log(" CAP NHAT HOT NEW THANH CONG !")
                            }
                        })
                    }
                });
                let total_chapter_crawler = await countChapter(novelInfo['novel_id']);
                console.log(`TONG SO CHAPTER ${novelInfo['novel_name']} DA CAO`, total_chapter_crawler);
                console.log(`TONG SO CHAPTER ${novelInfo['novel_name']} VICTIM`, novelInfo.chapters.length);
                if (total_chapter_crawler == novelInfo.chapters.length) {
                    const idx_id = novelIds.indexOf(novelUrl);
                    if (idx_id !== -1) {
                        novelIds.splice(idx_id, 1);
                    }
                }
                // if (total_chapter_crawler > novelInfo.chapters.length) {
                //     let deleted = await removeChapter(novelInfo['novel_id']);
                //     if (deleted) {
                //         console.log("xoa thanh cong")
                //         total_chapter_crawler = 0;
                //     }
                // }
                // if (total_chapter_crawler < novelInfo.chapters.length) {
                //     let deleted = await removeChapter(novelInfo['novel_id']);
                //     if (deleted) {
                //         console.log("xoa thanh cong")
                //         total_chapter_crawler = 0;
                //     }
                // }
                for (var j = total_chapter_crawler; j < novelInfo.chapters.length; j++) {
                    const chapter_victim_url = novelInfo.chapters[j].chapter_url;
                    const chapter_id = chapter_victim_url.match(/.*\/(.*)$/)[1].replace('.html', '').trim();
                    let checkChapter = await checkChapterExits(novelInfo['novel_id'].trim(), chapter_id, novelInfo.chapters[j].chapter_name.trim());
                    if (!checkChapter) {
                        try {
                            await page.setUserAgent(userAgent.toString())
                            await page.goto(chapter_victim_url, { timeout: 200000 });
                            await page.setViewport({
                                width: 1920 + Math.floor(Math.random() * 100),
                                height: 3000 + Math.floor(Math.random() * 100),
                                deviceScaleFactor: 1,
                                hasTouch: false,
                                isLandscape: false,
                                isMobile: false,
                            });
                            let chapterDetail = await page.evaluate(async() => {
                                if (document.querySelector("div[style = 'margin-top: 5px; margin-bottom: 5px;']")) {
                                    document.querySelector("div[style = 'margin-top: 5px; margin-bottom: 5px;']").remove();
                                }
                                document.querySelectorAll(".ads-holder").forEach(el => el.remove());
                                const chapter_name = document.querySelector('.top span.chapter').innerText.replace('Chapter', '').trim();
                                const chapter_content = document.querySelector('.txt') ? document.querySelector('.txt').innerHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/<!--.*?-->/sg, "") : '';
                                return {
                                    chapter_name: chapter_name,
                                    chapter_content: chapter_content
                                }
                            });
                            chapterDetail['chapter_id'] = chapter_id;
                            chapterDetail['crawler_date'] = new Date()
                            chapterDetail['novel'] = {
                                novel_id: novelInfo['novel_id'],
                                novel_name: novelInfo['novel_name']
                            }
                            let __idx = j;
                            if (chapterDetail['chapter_content'].length || chapterDetail['chapter_content'].includes('img')) {

                                Chapter.create(chapterDetail, function(err, data) {
                                    if (!err) {
                                        console.log("Them moi thanh cong chapter");

                                        if (__idx == (novelInfo.chapters.length - 1)) {
                                            const idx_id = novelIds.indexOf(novelUrl);
                                            if (idx_id !== -1) {
                                                novelIds.splice(idx_id, 1);
                                            }
                                            Novel.updateOne({ novel_id: novelInfo['novel_id'] }, {
                                                recentChapter: {
                                                    chapter_id: chapterDetail['chapter_id'],
                                                    chapter_name: chapterDetail['chapter_name']
                                                },
                                                crawler_date: new Date()
                                            }, function(err, data) {
                                                if (!err) {
                                                    console.log(" CAP NHAT chapter cuoi cung thanh cong !")
                                                }
                                            });
                                        }
                                        if (__idx == 0) {
                                            Novel.updateOne({ novel_id: novelInfo['novel_id'] }, {
                                                firstChapter: {
                                                    chapter_id: chapterDetail['chapter_id'],
                                                    chapter_name: chapterDetail['chapter_name']
                                                }
                                            }, function(err, data) {
                                                if (!err) {
                                                    console.log(" CAP NHAT chapter dau tien thanh cong !")
                                                }
                                            })
                                        }
                                    }
                                });
                            }
                        } catch (err) {
                            console.log(err);
                            console.log(`${chapter_victim_url} - Page ${page_index} KHONG VAO DUOC`)
                            writeLog(`${chapter_victim_url} - Page ${page_index} KHONG VAO DUOC`)
                        }
                    } else {
                        console.log("chapter da ton tai");
                    }
                    if (j == (novelInfo.chapters.length - 1)) {
                        const idx_id1 = novelIds.indexOf(novelUrl);
                        if (idx_id1 !== -1) {
                            novelIds.splice(idx_id1, 1);
                        }
                    }
                }
                console.log(`Daily Page :${page_index} Novel Name: ${novelInfo.novel_name} `)
            }

        }
    } catch (e) {
        console.log(e);
        console.log(`Khong vao duoc${BASE_URL}${page_index}`)
        writeLog(`TRANG CHINH ${BASE_URL}${page_index} KHONG VAO DUOC`);
    }

    await browser.close();
    return 1;
}

let checkNovelExits = function(novel_name, novel_id) {
        return new Promise(function(reslove, reject) {
                    Novel.findOne({
                                $or: [
                                        { novel_name: new RegExp(`^${novel_name}$`, 'i') },
                                        { novel_name: new RegExp(`^${novel_name.replace(`'`, `’`)}$`, 'i') },
                { novel_id: novel_id.trim() },

            ]
        }, function (err, novel) {
            if (!err) {
                if (novel) {
                    reslove(novel)
                } else {
                    reslove(null);
                }
            } else {
                reslove(null)
            }
        }).sort({ crawler_date: -1 }).limit(1);
    });
}
let checkChapterExits = function (novel_id, chapter_id, chapter_name) {
    return new Promise(function (reslove, reject) {
        Chapter.findOne({
            $or: [
                { "novel.novel_id": novel_id, "chapter_content": new RegExp(`Chapter ${chapter_name.split('–')[0].trim()}`, 'i') },
                { "novel.novel_id": novel_id, "chapter_content": new RegExp(`Chapter ${chapter_name}`, 'i') },
                { "novel.novel_id": novel_id, chapter_name: new RegExp(`^${chapter_name}$`, 'i') },
                { "novel.novel_id": novel_id, chapter_name: new RegExp(`^${chapter_name.replace(`'`, `’`)}$`, 'i') }
            ]
        }, function (err, chapter) {
            if (!err) {
                if (chapter) {
                    reslove(chapter)
                } else {
                    reslove(null);
                }
            } else {
                console.log(err)
                reslove(null)
            }
        }).sort({ crawler_date: -1 }).limit(1);
    })
}
let removeChapter = function (novel_id) {
    return new Promise(function (reslove, reject) {
        Chapter.remove({ "novel.novel_id": novel_id }, function (err, data) {
            if (!err) {
                reslove(true);
            } else {
                reslove(false);
            }
        })
    })

}
let getChapterDetail = async function (link) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox'],
        timeout: 15000

    });
    const page = await browser.newPage();
    // await page.setRequestInterception(true);
    await page.setDefaultNavigationTimeout(200000);
    await page.setUserAgent(userAgent.toString())

    await page.goto(link, { timeout: 200000 });
    await page.setViewport({
        width: 1920 + Math.floor(Math.random() * 100),
        height: 3000 + Math.floor(Math.random() * 100),
        deviceScaleFactor: 1,
        hasTouch: false,
        isLandscape: false,
        isMobile: false,
    });
    let prevChaperLink = await page.evaluate(async () => {
        document.querySelectorAll(".ads-holder").forEach(el => el.remove());
        const prevChaperLink = document.querySelector('#prev_chap').href.trim();
        const chapter_name = document.querySelector('.breadcrumb li:last-child a span').innerText.replace('Chapter', '').trim();
        const chapter_content = document.querySelector('.container #chr-content').innerHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        return {
            prevChaperLink: prevChaperLink,
            chapter_name: chapter_name,
            chapter_content: chapter_content
        };
    });
    await browser.close();
    return prevChaperLink;
}

let countChapter = function (novel_id) {
    return new Promise(function (reslove, reject) {
        Chapter.count({ "novel.novel_id": novel_id }, function (err, count) {
            if (!err) {
                reslove(count)
            } else {
                reslove(10000)
            }

        });
    })
}

module.exports = NovelCrawlerService;