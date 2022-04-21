require('dotenv').config();
const port = process.env.PORT || 3000;
const express = require('express');
const app = express();
var request = require('request');
const mongoose = require('mongoose');
var path = require('path');
const NovelCrawler = require('./services/novel-crawler');
const schedule = require('node-schedule');
var expressHbs = require('express-handlebars');
var bodyParser = require('body-parser');
const Chapter = require('./models/chapter');
const Novel = require('./models/novel');
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
let moment = require('moment');
mongoose.connect(process.env.DB_URL, {
    user: process.env.DB_USER,
    pass: process.env.DB_PASSWORD,
    useUnifiedTopology: true,
    useNewUrlParser: true
}, function (err) {
    if (!err) {
        console.log("Connect database successful")
    } else {
        console.log(err)
    }
});

app.use('/', express.static(path.join(__dirname, "public")));

app.engine('.hbs', expressHbs({
    defaultLayout: 'layout',
    partialsDir: "views/partials/",
    extname: '.hbs'
}));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.use('/', express.static(path.join(__dirname, "public")));

app.get('/start/:from/:to', async function (req, res) {
    const from = Number(req.params.from);
    const to = Number(req.params.to);
    if (from && to) {
        const crawler = new NovelCrawler();
        res.json({
            success: true,
            msg: 'Crawling'
        })
        for (let page = from; page <= to; page++) {
            console.log(` System Crawling page ${page}`)
            await crawler.getComics(page);
        }

    } else {
        return res.json({
            success: false,
            msg: 'Check param'
        })
    }

});

app.get('/checkChapter', function (req, res) {
    res.render('checkChapter', {
        layout: 'layout.hbs',
    });
});

app.get('/', function (req, res) {
    return res.json({
        success: true,
        msg: 'OK'
    })
})



const job = schedule.scheduleJob(process.env.TIME_CRAWLER, function () {
    console.log("init crawler")
    if (process.env.AUTO_CRAWLER == 1) {
        for (let page = 1; page <= 2; page++) {
            console.log(` System Crawling page ${page}`)
            const crawler = new NovelCrawler();
            crawler.getComics(page);
        }
    }
});

const jobCheckDb = schedule.scheduleJob(process.env.TIME_CHECK_DB, function () {
    try {
        Novel.find({}, function (err, novel) {
            if (!err) {

            } else {
                request('https://api.telegram.org/bot5206945870:AAGEDYKICCHO9tTK2v9OB1Sv2Mkc0jGrgHM/sendMessage?chat_id=-630503903&parse_mode=html&text=------Ket Noi DB That Bai------', function (error, response, body) {

                });
            }
        }).limit(1);
    } catch (error) {
        request('https://api.telegram.org/bot5206945870:AAGEDYKICCHO9tTK2v9OB1Sv2Mkc0jGrgHM/sendMessage?chat_id=-630503903&parse_mode=html&text=------Ket Noi DB That Bai------', function (error, response, body) {
        });
    }

});

const jobSendTele = schedule.scheduleJob(process.env.TIME_SEND_TELEGRAM, function () { 
    try {
        const gte = moment().subtract(4, 'hour').valueOf();
        const lte = moment().valueOf();
        let query = {
            "crawler_date": { $gte: new Date(gte), $lt: new Date(lte) }
        }
        Novel.find(query, function(err, novels) {
            if(!err) {
                
                let msg = createMessage(novels);
                request(`https://api.telegram.org/bot5206945870:AAGEDYKICCHO9tTK2v9OB1Sv2Mkc0jGrgHM/sendMessage?chat_id=-${process.env.TELE_GROUP_ID}&parse_mode=html&text=${encodeURI(msg)}`, function (error, response, body) {
                    console.log(error)
                });
            }
        }).sort({ crawler_date: -1 }).lean().limit(30);
    } catch (err) {
    
    }

});

const jobResetView= schedule.scheduleJob(process.env.TIME_RESET_VIEWTODAY, function () { 
    try {
        Novel.updateMany({}, {viewToDay : 0}, function(err, novels) {
            if(!err) {
                console.log("update thanh cong")
            }
        });
    } catch (err) {
    
    }
});


let createMessage = function(novels) {
    let msg = '<b>List of novel updated in the last 4 hours: </b>' + "\n";
    for (let _idx = 0; _idx < novels.length; _idx++) {
        const novel = novels[_idx];
        msg =msg + `<b>${_idx + 1}</b>: <a href = "${createLinkChapter(novel.novel_id, novel.recentChapter.chapter_id)}" target="_blank"><b>${novel.novel_name} - Chapter ${novel.recentChapter.chapter_name}</b></a> - ${moment(novel.crawler_date).fromNow()}` + "\n";
        
    }
    return msg;
}

let createLinkChapter = function(novel_id, chapter_id) {
    return `${process.env.BASE_URL_CHAPTER}/${novel_id}/${chapter_id}`;
}
app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});