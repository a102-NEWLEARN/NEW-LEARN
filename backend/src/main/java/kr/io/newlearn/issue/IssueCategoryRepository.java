package kr.io.newlearn.issue;

import org.springframework.data.jpa.repository.JpaRepository;

public interface IssueCategoryRepository extends JpaRepository<IssueCategory, IssueCategoryId> {}
