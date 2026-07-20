const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { request } = require('../../../../services/api-client')
Page({data:{stats:{},bills:[],loading:true,message:''},onShow(){const session=getSession();if(!session||!hasRole(session,ROLES.FINANCE))return wx.reLaunch({url:'/pages/auth/login/index'});request('/v1/finance/dashboard',{session}).then(data=>this.setData({stats:data.stats||{},bills:data.bills||[],loading:false,message:''})).catch(error=>this.setData({loading:false,message:error.message}))},goBills(){wx.navigateTo({url:'/modules/finance/pages/bills/index'})}})
