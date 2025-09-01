import hashlib
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Header, Response
import sqlalchemy as sa
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.budget import Budget
from app.models.category import CategoryGroup, Category, MonthlyCategoryBudget
from app.models.transaction import Transaction, SubTransaction
from app.models.account import Account
from datetime import datetime
from app.models.audit import AuditLog
from app.schemas.categories import (
    CategoryGroupCreate,
    CategoryCreate,
    CategoriesMonthResponse,
    CategoryMonthOut,
    AssignRequest,
    MoveMonthRequest,
    MoveBetweenCategoriesRequest,
    CategoryPatch,
    CategoryGroupPatch,
)


router = APIRouter(prefix="/api/v1", tags=["categories"])


def _normalize_month(d: date) -> date:
    return d.replace(day=1)


@router.post("/budgets/{budget_id}/category-groups", response_model=dict)
def create_group(budget_id: UUID, payload: CategoryGroupCreate, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    g = CategoryGroup(budget_id=budget_id, name=payload.name, sort=payload.sort)
    db.add(g)
    db.commit()
    db.refresh(g)
    return {"id": str(g.id), "name": g.name, "sort": g.sort}


@router.patch("/budgets/{budget_id}/category-groups/{group_id}", response_model=dict)
def patch_group(budget_id: UUID, group_id: UUID, payload: CategoryGroupPatch, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    g = db.get(CategoryGroup, group_id)
    if not g or g.budget_id != budget_id:
        raise HTTPException(404, "Category group not found")
    if payload.name is not None:
        g.name = payload.name
    db.commit()
    db.refresh(g)
    return {"id": str(g.id), "name": g.name, "sort": g.sort}


@router.delete("/budgets/{budget_id}/category-groups/{group_id}", status_code=204)
def delete_group(budget_id: UUID, group_id: UUID, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    g = db.get(CategoryGroup, group_id)
    if not g or g.budget_id != budget_id:
        raise HTTPException(404, "Category group not found")
    db.delete(g)
    db.commit()
    return


@router.post("/budgets/{budget_id}/categories", response_model=dict)
def create_category(budget_id: UUID, payload: CategoryCreate, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    grp = db.get(CategoryGroup, payload.group_id)
    if not grp or grp.budget_id != budget_id:
        raise HTTPException(400, "Invalid group")
    c = Category(
        budget_id=budget_id,
        group_id=payload.group_id,
        name=payload.name,
        sort=payload.sort,
        hidden=payload.hidden,
        is_credit_payment=payload.is_credit_payment,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return {"id": str(c.id)}


@router.patch("/budgets/{budget_id}/categories/{category_id}", response_model=dict)
def patch_category(budget_id: UUID, category_id: UUID, payload: CategoryPatch, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    c = db.get(Category, category_id)
    if not c or c.budget_id != budget_id:
        raise HTTPException(404, "Category not found")
    if payload.name is not None:
        c.name = payload.name
    if payload.hidden is not None:
        c.hidden = payload.hidden
    db.commit()
    db.refresh(c)
    return {"id": str(c.id)}


@router.delete("/budgets/{budget_id}/categories/{category_id}", status_code=204)
def delete_category(budget_id: UUID, category_id: UUID, db: Session = Depends(get_db)):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    c = db.get(Category, category_id)
    if not c or c.budget_id != budget_id:
        raise HTTPException(404, "Category not found")
    db.delete(c)
    db.commit()
    return


@router.get("/budgets/{budget_id}/categories", response_model=CategoriesMonthResponse)
def list_categories_month(
    budget_id: UUID,
    month: date,
    db: Session = Depends(get_db),
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    response: Response = None,
):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    m = _normalize_month(month)

    groups = db.query(CategoryGroup).filter_by(budget_id=budget_id).order_by(CategoryGroup.sort, CategoryGroup.name).all()
    cats = db.query(Category).filter_by(budget_id=budget_id).order_by(Category.sort, Category.name).all()

    # Load monthly rows for given month
    cat_ids = [c.id for c in cats]
    monthlies = (
        db.query(MonthlyCategoryBudget)
        .filter(MonthlyCategoryBudget.category_id.in_(cat_ids), MonthlyCategoryBudget.month == m)
        .all()
        if cat_ids
        else []
    )
    m_by_cat = {row.category_id: row for row in monthlies}

    # Compute activity for the month from subtransactions (outflows as positive)
    # month window: [m, next_month)
    import datetime as _dt
    year = m.year
    month_num = m.month
    if month_num == 12:
        next_month = _dt.date(year + 1, 1, 1)
    else:
        next_month = _dt.date(year, month_num + 1, 1)

    activity_by_cat: dict[UUID, int] = {}
    if cat_ids:
        q = (
            db.query(SubTransaction.category_id, sa.func.sum(SubTransaction.amount_cents))
            .join(Transaction, SubTransaction.transaction_id == Transaction.id)
            .filter(
                Transaction.budget_id == budget_id,
                Transaction.deleted_at.is_(None),
                Transaction.date >= m,
                Transaction.date < next_month,
                SubTransaction.category_id.in_(cat_ids),
            )
            .group_by(SubTransaction.category_id)
        )
        for cid, total in q:
            # outflows are negative amounts; activity is positive spend
            activity_by_cat[cid] = int(-total) if total is not None and total < 0 else 0

    # Build response lists
    months = []
    for c in cats:
        row = m_by_cat.get(c.id)
        assigned = row.assigned_cents if row else 0
        activity = activity_by_cat.get(c.id, 0)
        available = assigned - activity
        months.append(
            CategoryMonthOut(
                category_id=c.id,
                month=m,
                assigned_cents=assigned,
                activity_cents=activity,
                available_cents=available,
            )
        )

    # Incomes targeted to this month on on-budget accounts
    income_sum = (
        db.query(sa.func.coalesce(sa.func.sum(Transaction.amount_cents), 0))
        .join(Account, Account.id == Transaction.account_id)
        .filter(
            Transaction.budget_id == budget_id,
            Transaction.deleted_at.is_(None),
            Transaction.income_month == m,
            Account.on_budget.is_(True),
        )
        .scalar()
        or 0
    )

    total_assigned = sum(x.assigned_cents for x in months)
    available_to_budget = int(income_sum) - int(total_assigned)

    # ETag: hash of assigned values + counts + income
    etag_raw = f"{budget_id}|{m.isoformat()}|{len(groups)}|{len(cats)}|" + \
        ",".join(f"{x.category_id}:{x.assigned_cents}" for x in months) + f"|income:{income_sum}"
    etag = 'W/"' + hashlib.sha256(etag_raw.encode()).hexdigest() + '"'
    if if_none_match == etag and response is not None:
        # Short-circuit: Not Modified
        response.status_code = 304
        return None  # FastAPI will ignore body for 304
    if response is not None:
        response.headers["ETag"] = etag

    return CategoriesMonthResponse(
        month=m,
        groups=groups,
        categories=cats,
        months=months,
        available_to_budget_cents=available_to_budget,
    )


@router.post("/budgets/{budget_id}/categories/{category_id}/assign", response_model=CategoriesMonthResponse)
def assign_to_category(
    budget_id: UUID,
    category_id: UUID,
    payload: AssignRequest,
    db: Session = Depends(get_db),
):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    c = db.get(Category, category_id)
    if not c or c.budget_id != budget_id:
        raise HTTPException(404, "Category not found")
    m = _normalize_month(payload.month)

    row = (
        db.query(MonthlyCategoryBudget)
        .filter_by(category_id=category_id, month=m)
        .one_or_none()
    )
    before = row.assigned_cents if row else 0
    if row is None:
        row = MonthlyCategoryBudget(category_id=category_id, month=m, assigned_cents=0)
        db.add(row)
        db.flush()
    row.assigned_cents = before + int(payload.delta_cents)
    row.updated_at = datetime.utcnow()
    db.flush()

    # Audit
    db.add(
        AuditLog(
            budget_id=budget_id,
            action="assign",
            entity_type="monthly_category_budget",
            entity_id=row.id,
            diff_json={
                "category_id": str(category_id),
                "month": m.isoformat(),
                "assigned_before": before,
                "delta": int(payload.delta_cents),
                "assigned_after": row.assigned_cents,
            },
        )
    )
    db.commit()

    # Return updated month rollup
    return list_categories_month(budget_id, m, db)


@router.post("/budgets/{budget_id}/categories/{category_id}/move", response_model=CategoriesMonthResponse)
def move_within_category_months(
    budget_id: UUID,
    category_id: UUID,
    payload: MoveMonthRequest,
    db: Session = Depends(get_db),
):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    c = db.get(Category, category_id)
    if not c or c.budget_id != budget_id:
        raise HTTPException(404, "Category not found")
    from_m = _normalize_month(payload.from_month)
    to_m = _normalize_month(payload.to_month)
    amt = int(payload.amount_cents)
    if amt == 0 or from_m == to_m:
        return list_categories_month(budget_id, to_m, db)

    # Load or create both rows
    from_row = (
        db.query(MonthlyCategoryBudget)
        .filter_by(category_id=category_id, month=from_m)
        .one_or_none()
    )
    to_row = (
        db.query(MonthlyCategoryBudget)
        .filter_by(category_id=category_id, month=to_m)
        .one_or_none()
    )
    if from_row is None:
        from_row = MonthlyCategoryBudget(category_id=category_id, month=from_m, assigned_cents=0)
        db.add(from_row)
        db.flush()
    if to_row is None:
        to_row = MonthlyCategoryBudget(category_id=category_id, month=to_m, assigned_cents=0)
        db.add(to_row)
        db.flush()

    before_from = from_row.assigned_cents
    before_to = to_row.assigned_cents
    from_row.assigned_cents = before_from - amt
    to_row.assigned_cents = before_to + amt

    # Audit
    db.add(
        AuditLog(
            budget_id=budget_id,
            action="move_month",
            entity_type="category",
            entity_id=category_id,
            diff_json={
                "from_month": from_m.isoformat(),
                "to_month": to_m.isoformat(),
                "amount_cents": amt,
                "from_before": before_from,
                "to_before": before_to,
                "from_after": from_row.assigned_cents,
                "to_after": to_row.assigned_cents,
            },
        )
    )
    db.commit()
    return list_categories_month(budget_id, to_m, db)


@router.post("/budgets/{budget_id}/categories/move", response_model=CategoriesMonthResponse)
def move_between_categories(
    budget_id: UUID,
    payload: MoveBetweenCategoriesRequest,
    db: Session = Depends(get_db),
):
    _ = db.get(Budget, budget_id) or (_ for _ in ()).throw(HTTPException(404, "Budget not found"))
    from_cat = db.get(Category, payload.from_category_id)
    to_cat = db.get(Category, payload.to_category_id)
    if not from_cat or not to_cat or from_cat.budget_id != budget_id or to_cat.budget_id != budget_id:
        raise HTTPException(400, "Invalid categories")
    m = _normalize_month(payload.month)
    amt = int(payload.amount_cents)
    if amt == 0 or payload.from_category_id == payload.to_category_id:
        return list_categories_month(budget_id, m, db)

    from_row = (
        db.query(MonthlyCategoryBudget)
        .filter_by(category_id=payload.from_category_id, month=m)
        .one_or_none()
    )
    to_row = (
        db.query(MonthlyCategoryBudget)
        .filter_by(category_id=payload.to_category_id, month=m)
        .one_or_none()
    )
    if from_row is None:
        from_row = MonthlyCategoryBudget(category_id=payload.from_category_id, month=m, assigned_cents=0)
        db.add(from_row)
        db.flush()
    if to_row is None:
        to_row = MonthlyCategoryBudget(category_id=payload.to_category_id, month=m, assigned_cents=0)
        db.add(to_row)
        db.flush()

    before_from = from_row.assigned_cents
    before_to = to_row.assigned_cents
    from_row.assigned_cents = before_from - amt
    to_row.assigned_cents = before_to + amt
    db.add(
        AuditLog(
            budget_id=budget_id,
            action="move_between_categories",
            entity_type="category",
            entity_id=payload.to_category_id,
            diff_json={
                "month": m.isoformat(),
                "from_category_id": str(payload.from_category_id),
                "to_category_id": str(payload.to_category_id),
                "amount_cents": amt,
                "from_before": before_from,
                "to_before": before_to,
                "from_after": from_row.assigned_cents,
                "to_after": to_row.assigned_cents,
            },
        )
    )
    db.commit()
    return list_categories_month(budget_id, m, db)
