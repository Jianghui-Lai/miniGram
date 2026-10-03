/**
 * 页面级查询聚合（把「算什么」从页面里搬出来）
 *
 * 页面只负责 setData，统计口径全部在这里，改一次全站生效。
 */

const leaseManager = require('./lease-manager.js')
const rentStatus = require('./rent-status.js')
const money = require('./money.js')

/**
 * 首页看板数据
 * @param {Array} list 全部房产
 * @param {number} year
 * @param {number} month
 */
function buildDashboard(list, year, month) {
  const properties = (list || []).filter(
    p => leaseManager.getPropertyStatus(p) === leaseManager.STATUS.RENTING
  )

  const rows = properties.map(property => {
    const detail = rentStatus.getMonthStatusDetail(property, year, month)
    const paidAmount = detail.status === rentStatus.STATUS.PAID
      ? (detail.payment ? money.num(detail.payment.amount) : money.num(property.monthlyRent))
      : 0

    return {
      ...property,
      _status: detail.status,
      _statusText: detail.text,
      _statusColor: detail.color,
      _dotColor: detail.dotColor,
      _paidAmount: paidAmount
    }
  })

  const totalRent = money.sum(rows, r => r.monthlyRent)
  const paidRent = money.sum(rows, r => r._paidAmount)

  const summary = {
    paid: rows.filter(r => r._status === rentStatus.STATUS.PAID).length,
    overdue: rows.filter(r => r._status === rentStatus.STATUS.OVERDUE).length,
    unpaid: rows.filter(r => r._status === rentStatus.STATUS.UNPAID).length
  }

  return {
    properties: rows,
    totalRent,
    paidRent,
    pendingRent: money.round2(totalRent - paidRent),
    pendingCount: summary.overdue + summary.unpaid,
    overdueCount: summary.overdue,
    pendingMonthsCount: summary.unpaid
  }
}

/**
 * 全部房产按租期状态分组
 * @param {Array} list
 */
function groupByStatus(list) {
  const groups = { rentingList: [], upcomingList: [], unrentedList: [] }

  ;(list || []).forEach(property => {
    const status = leaseManager.getPropertyStatus(property)
    if (status === leaseManager.STATUS.RENTING) groups.rentingList.push(property)
    else if (status === leaseManager.STATUS.UPCOMING) groups.upcomingList.push(property)
    else groups.unrentedList.push(property)
  })

  return groups
}

/**
 * 给详情页组装「房产 + 年历 + 统计」一整套数据
 * @param {Object} property
 * @param {number} year
 * @param {number} month 当前自然月，用于底部按钮判断
 */
function buildPropertyDetail(property, year, month) {
  const status = leaseManager.getPropertyStatus(property)
  const monthsData = rentStatus.getDueMonthsInYear(property, year)
  const currentDetail = rentStatus.getMonthStatusDetail(property, year, month)

  const countBy = (s) => monthsData.filter(m => m.status === s).length

  return {
    property: {
      ...property,
      totalReceivedRent: require('./property-repo.js').calcTotalReceived(property),
      _status: currentDetail.status
    },
    status,
    statusText: leaseManager.STATUS_TEXT[status],
    isRenting: status === leaseManager.STATUS.RENTING,
    monthsData,
    paidMonthsCount: countBy(rentStatus.STATUS.PAID),
    overdueMonthsCount: countBy(rentStatus.STATUS.OVERDUE),
    pendingMonthsCount: countBy(rentStatus.STATUS.UNPAID)
  }
}

module.exports = {
  buildDashboard,
  groupByStatus,
  buildPropertyDetail
}
