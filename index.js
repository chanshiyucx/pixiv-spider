const fs = require('fs')
const axios = require('axios')
const cheerio = require('cheerio')
const Promise = require('bluebird')
const querystring = require('querystring')

const config = require('./config')
const { username, password, mode, author, tags, rated } = config

// 地址真是多得记不住啊 /(ㄒoㄒ)/~~
const LOGIN_URL = 'https://accounts.pixiv.net/login?lang=zh&source=pc&view_type=page&ref=wwwtop_accounts_index'
const LOGIN_API = 'https://accounts.pixiv.net/api/login?lang=zh'
const STAR_URL = 'https://www.pixiv.net/bookmark.php?rest=show&order=desc'
const IMG_URL = 'https://www.pixiv.net/member_illust.php?mode=medium&illust_id='
const MANAGE_URL = 'https://www.pixiv.net/member_illust.php?mode=manga_big&illust_id='
const AUTHOR_URL = 'https://www.pixiv.net/member_illust.php?id='
const FOLLOW_URL = 'https://www.pixiv.net/bookmark.php?type=user&rest=show&p='
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36'

class Pixiv {
  constructor () {
    this.mode = mode
    this.cookie = ''
  }

  // 获取登陆 key
  async getKey () {
    try {
      const res = await axios({
        method: 'get',
        url: LOGIN_URL,
        header: {
          'User-Agent': USER_AGENT
        }
      })
      const $ = cheerio.load(res.data)
      const postKey = $('input[name="post_key"]').val()
      const postCookie = res.headers['set-cookie'].join('; ')
      return { postKey, postCookie }
    } catch (err) {
      console.log(err)
    }
  }

  // 登陆
  async login ({ postKey, postCookie }) {
    try {
      const res = await axios({
        method: 'post',
        url: LOGIN_API,
        headers: {
          'User_Agent': USER_AGENT,
          'Content_Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': 'https://accounts.pixiv.net',
          'Referer': 'https://accounts.pixiv.net/login?lang=zh&source=pc&view_type=page&ref=wwwtop_accounts_index',
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': postCookie
        },
        data: querystring.stringify({
          pixiv_id: username,
          password: password,
          captcha: '',
          g_recaptcha_response: '',
          post_key: postKey,
          source: 'pc',
          ref: 'wwwtop_accounts_index',
          return_to: 'https://www.pixiv.net/'
        })
      })
      const cookie = res.headers['set-cookie'].join('; ')
      // 将 cookie 写入文件
      fs.writeFileSync('cookie.txt', cookie)
      return cookie
    } catch (err) {
      console.log(err)
    }
  }

  // 获取总页数
  async getPageSize (url) {
    try {
      const res = await axios({
        method: 'get',
        url: url,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net',
          'Cookie': this.cookie
        }
      })
      const $ = cheerio.load(res.data)
      const pageList = $('.page-list')
      const pageSize = pageList.length ? pageList.children().last().find('a').text() : 1
      return pageSize
    } catch (err) {
      console.log(err)
    }
  }

  // 获取画师列表
  async getAuthorList (url) {
    try {
      const res = await axios({
        method: 'get',
        url: url,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net',
          'Cookie': this.cookie
        }
      })
      const $ = cheerio.load(res.data)
      const members = $('.members').find('li')
      let authorList = []
      members.each(function () {
        const author = $(this).find('input').val()
        authorList.push(author)
      })
      return authorList
    } catch (err) {
      console.log(err)
    }
  }

  // 按画师下载
  async downloadByAuthor (author) {
    try {
      const defaultUrl = `${AUTHOR_URL}${author}&type=all`
      const pageSize = await this.getPageSize(defaultUrl)
      for (let i = 1; i <= pageSize; i++) {
        console.log(`--------开始下载第${i}页--------`)
        const url = `${defaultUrl}&p=${i}`
        const imgList = await this.getImgList(url)
        await Promise.map(imgList, (img) => this.download(img), { concurrency: 5 })
      }
    } catch (err) {
      console.log(err)
    }
  }

  // 获取单页收藏夹
  async getImgList (url) {
    try {
      const res = await axios({
        method: 'get',
        url: url,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net',
          'Cookie': this.cookie
        }
      })
      const $ = cheerio.load(res.data)
      const list = $('._image-items').eq(0).find('.image-item')
      const imgList = []
      // 如果是下载作者列表，那么不需要每次都去获取作者，而且也获取不到
      let author
      if (this.mode !== 'star') {
        author = $('.user-name').text()
      }
      list.each(function () {
        const id = $(this).find('img').attr('data-id')
        const name = $(this).find('.title').text()
        author = author || $(this).find('.user').text()
        const img = {
          id,
          name,
          author
        }
        imgList.push(img)
      })
      return imgList
    } catch (err) {
      console.log(err)
    }
  }

  // 整理单个收藏
  async download ({ id, name, author }) {
    try {
      const src = `${IMG_URL}${id}`
      const res = await axios({
        method: 'get',
        url: src,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net/bookmark.php?rest=show&order=date_d',
          'Cookie': this.cookie
        }
      })
      const $ = cheerio.load(res.data)
      // 收藏夹不筛选，其他模式需要筛选
      if (this.mode !== 'star' && rated) {
        const ratedCount = parseInt($('.rated-count').text(), 10)
        if (ratedCount < rated) return
      }
      const readMore = $('.works_display').find('.read-more')
      // imgUrl ---> https://i.pximg.net/c/600x600/img-master/img/2018/01/26/00/00/47/66965496_p0_master1200.jpg
      // origin ---> https://i.pximg.net/img-original/img/2018/01/26/00/00/47/66965496_p0.png
      if (!readMore.length) {
        // 不是图集，直接获取高清图
        const modal = $('._illust_modal')
        const imgUrl = modal.find('img').attr('data-src')
        await this.downloadImg({ id, name, author, imgUrl })
      } else {
        // 是图集，获取所有图片链接
        const more = readMore.text() // 查看更多（9枚）
        const num = /\d+/.exec(more)
        const count = parseInt(num[0], 10)
        for (let i = 0; i < count; i++) {
          // https://www.pixiv.net/member_illust.php?mode=manga_big&illust_id=66969792&page=0
          const manageUrl = `${MANAGE_URL}${id}&page=${i}`
          await this.manage({ id, name, author, manageUrl })
        }
      }
    } catch (err) {
      console.log(err)
    }
  }

  // 获取图集
  async manage ({ id, name, author, manageUrl }) {
    try {
      // https://www.pixiv.net/member_illust.php?mode=manga&illust_id=66969792
      const Referer = `https://www.pixiv.net/member_illust.php?mode=manga&illust_id=${id}`
      const res = await axios({
        method: 'get',
        url: manageUrl,
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': Referer,
          'Cookie': this.cookie
        }
      })
      const $ = cheerio.load(res.data)
      const imgUrl = $('img').attr('src')
      await this.downloadImg({ id, name, author, imgUrl })
    } catch (err) {
      console.log(err)
    }
  }

  // 下载图片
  async downloadImg ({ id, name, author, imgUrl }) {
    if (!imgUrl) {
      console.log(`图片 ${id} 解析错误，请检查知悉！`)
      return
    }
    return new Promise((resolve, reject) => {
      const fileName = imgUrl.substring(imgUrl.lastIndexOf('/') + 1)
      axios({
        method: 'get',
        url: imgUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': USER_AGENT,
          'Referer': 'https://www.pixiv.net/bookmark.php?rest=show&order=date_d',
          'Cookie': this.cookie
        }
      }).then(res => {
        res.data.pipe(fs.createWriteStream(`download/${fileName}`)).on('close', () => {
          console.log(`下载完成: 文件: ${fileName}    作品: ${name}    画师：${author}`)
          resolve()
        })
      }).catch(err => reject(err))
    }).catch(console.err)
  }

  // 启动
  async start () {
    fs.stat('cookie.txt', async (err, stat) => {
      if (err) console.log('cookie 不存在，初次登陆获取 cookie', err)
      // 获取 cookie
      if (stat && stat.isFile()) {
        this.cookie = fs.readFileSync('cookie.txt', 'utf8')
      } else {
        const key = await this.getKey()
        this.cookie = await this.login(key)
      }
      this.mode = mode
      if (this.mode === 'star') {
        // 下载收藏夹
        const pageSize = await this.getPageSize(STAR_URL)
        for (let i = 1; i <= pageSize; i++) {
          console.log(`--------开始下载第${i}页--------`)
          const url = `${STAR_URL}&p=${i}`
          const imgList = await this.getImgList(url)
          await Promise.map(imgList, (img) => this.download(img), { concurrency: 5 })
        }
        console.log('收藏夹下载完成 o(*￣▽￣*)ブ')
      } else if (this.mode === 'author' && author.length) {
        // 下载作者列表
        for (const a of author) {
          console.log(`--------开始下载画师 ${a} 的作品--------`)
          await this.downloadByAuthor(a)
        }
        console.log('作者列表下载完成 o(*￣▽￣*)ブ')
      } else if (this.mode === 'follow') {
        // TODO: 我关注的作者
        const pageSize = await this.getPageSize(`${FOLLOW_URL}1`)
        for (let i = 1; i <= pageSize; i++) {
          const defaultUrl = `${FOLLOW_URL}${i}`
          const authorList = await this.getAuthorList(defaultUrl)
          for (const a of authorList) {
            console.log(`--------开始下载画师 ${a} 的作品--------`)
            await this.downloadByAuthor(a)
          }
        }
      }
    })
  }
}

// 开始启动
const pixiv = new Pixiv()
pixiv.start()
