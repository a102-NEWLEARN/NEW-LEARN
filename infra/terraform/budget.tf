# EC2 는 후불이라 켜 둔 것을 잊으면 그대로 청구된다 — 예산 알림을 서버와 같이 둔다 (SSOT.md 6절)
# 승인 금액은 운영 기간 전체(10/19~11/18) 합계다. 달마다 나누지 않고 시작일부터 쌓인 비용을 그 금액에 대 본다
resource "aws_budgets_budget" "project_total" {
  name              = "newlearn-project-total"
  budget_type       = "COST"
  limit_amount      = tostring(var.budget_limit_usd)
  limit_unit        = "USD"
  time_unit         = "ANNUALLY"
  time_period_start = var.budget_start

  # 크레딧을 빼기 전 금액으로 잰다. 무료 플랜 크레딧($100)은 승인 금액을 넘었을 때 쓰는 여유분이라
  # 크레딧이 요금을 덮어도 실제 사용량은 승인 금액에 대 봐야 한다
  cost_types {
    include_credit = false
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = [var.budget_alert_email]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = [var.budget_alert_email]
  }
}
