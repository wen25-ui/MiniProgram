const { getSession, hasRole } = require('../../../../core/auth/session')
const { ROLES } = require('../../../../core/auth/roles')
const { request } = require('../../../../services/api-client')
Page({data:{applications:[],loading:true,message:''},onShow(){const session=getSession();if(!session||!hasRole(session,ROLES.MERCHANT))return wx.reLaunch({url:'/pages/auth/login/index'});request('/v1/merchant/applications',{session}).then(data=>this.setData({applications:data.applications||[],loading:false,message:''})).catch(error=>this.setData({loading:false,message:error.message}))}})
