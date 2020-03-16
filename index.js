const puppeteer = require('puppeteer');
const axios = require('axios').default;

let CFG = {
    threshold: 10,
    refresh_time: 60,
    ftqq: 'x'
};

(async () => {
    const browser = await puppeteer.launch();

    async function getJpy(){
        return new Promise(async next => {
            const page = await browser.newPage();
            await page.goto('https://bitflyer.com/ja-jp/ex/SimpleEx');

            await page.waitFor('.ita-asks tr:nth-of-type(1) td:nth-of-type(2)');
            await page.waitFor(3600);
            await page.screenshot({ path: 'example.png' });

            let itaAsks = await page.$('.ita-asks');
            let jpys = await itaAsks.$$eval('tr', els => Array.from(els).map(el=> {
                let tds = el.getElementsByTagName('td');

                if(tds && tds[1] && tds[1].textContent){
                    return parseFloat(tds[1].textContent.replace(/,/g, ''));
                }
                return null;
            }));

            if(!jpys || jpys.length == 0){
                next(null);
                page.close();
                return;
            }

            let jpyA = jpys[jpys.length / 2 - 1];
            let jpyB = jpys[jpys.length / 2];
            if(!jpyA || !jpyB){
                next(null);
                page.close();
                return;
            }

            next((jpyA + jpyB) / 2);
            page.close();
        });
    }

    // async function initJpy(){
    //     const page = await browser.newPage();
    //     await page.goto('https://bitflyer.com/ja-jp/ex/SimpleEx');
    // }
    
    // function getJpy(){
    //     return new Promise(async next=>{
    //         let itaAsks = await page.$('.ita-asks');
    //         let jpys = await itaAsks.$$eval('tr', els => Array.from(els).map(el=> {
    //             let tds = el.getElementsByTagName('td');

    //             if(tds && tds[1] && tds[1].textContent){
    //                 return parseFloat(tds[1].textContent.replace(/,/g, ''));
    //             }
    //             return null;
    //         }));

    //         if(!jpys || jpys.length == 0){
    //             next(null);
    //             return;
    //         }

    //         let jpyA = jpys[jpys.length / 2 - 1];
    //         let jpyB = jpys[jpys.length / 2];
    //         if(!jpyA || !jpyB){
    //             next(null);
    //             return;
    //         }

    //         next((jpyA + jpyB) / 2);
    //     });
    // }

    // setInterval(async () => {
    //     console.log(await getJpy());
    // }, 1000);
    // (async ()=>{
        
    //     // await page.screenshot({ path: 'example.png' });
    //     // await browser.close();
    // }, 5000)

    function getJpyRatio(){
        return new Promise(async next => {
            const page = await browser.newPage();
            await page.goto('https://srh.bankofchina.com/search/whpj/search_cn.jsp');
            
            
            await page.waitForSelector('.invest_t select>option', {
                timeout: 8000
            });

            await page.select('.invest_t select', '日元');
            await page.click('.invest_t .search_btn');

            await page.waitFor('.BOC_main.publish .odd>td');

            let ratio = await page.$eval('.BOC_main.publish tbody tr.odd td:nth-child(4)', el=>el.textContent);
            page.close();
            next(ratio || null);
        });
    }

    // console.log(await getJpyRatio());

    function getCny(){
        return new Promise(async next=>{
            const page = await browser.newPage();
            await page.goto('https://c2c.hbg.com/zh-cn/trade/buy-btc/');

            await page.waitFor('.trade-content .otc-trade-list', {
                timeout: 8000
            });
            let str = await page.$eval('.trade-content .otc-trade-list .price.average', el => el.textContent);
            str = str.replace(/,/g, '');
            str = str.replace(/CNY/g, '');
            try {
                next(parseFloat(str) || 0)
            } catch (error) {
                next(null);
            }
        })
    }

    function getCfg(){
        return new Promise(async next=>{
            axios.get('https://raw.githubusercontent.com/wilhantian/btc-spider/master/config.json').then(res=>{
                let obj = JSON.parse(res.data);
                next({
                    threshold: obj.threshold,
                    refresh_time: obj.refresh_time,
                    ftqq: obj.ftqq
                })
            }).catch((e)=>{
                next(null)
            });
        });
    }

    function noticeWx(msg){
        return new Promise(async next=>{
            axios.get(`https://sc.ftqq.com/${CFG.ftqq}.send?text=${msg}`).then(()=>{
                next(true);
            }).catch(e=>{
                next(true);
            })
        });
    }


    ///////////////////////////////////
    // 开始轮询
    async function loop(){
        // 获取配置
        let newCfg = await getCfg();
        if(newCfg){
            CFG = newCfg;
        }

        // 获取数据
        try {
            // Promise.all()
            let args = await Promise.all([getJpy(), getJpyRatio(), getCny()]);

            let jpy = args[0];
            let jpyRatio = args[1];
            let cny = args[2];

            let jpyCn = jpy * (jpyRatio / 100);
            console.log(`日本BTC(日元):${jpy}  汇率:${jpyRatio}  日本BTC(人民币):${jpyCn}  国内BTC(人民币):${cny}`);

            if(jpyCn - cny > CFG.threshold){
                await noticeWx(`[JP市场 > CN市场]  日本BTC(日元)：${jpy}  汇率：${jpyRatio}  日本BTC(人民币)：${jpyCn}  国内BTC(人民币)：${cny}`);
            }else if(cny - jpyCn > CFG.threshold){
                await noticeWx(`[CN市场 > JP市场]  日本BTC(日元)：${jpy}  汇率：${jpyRatio}  日本BTC(人民币)：${jpyCn}  国内BTC(人民币)：${cny}`);
            }
            

        } catch (error) {
            console.log(error);
        }
        
        setTimeout(()=>{
            loop();
        }, CFG.refresh_time * 1000);
    }

    loop();

    // console.log(CFG);

    // console.log(await getCny())
})();