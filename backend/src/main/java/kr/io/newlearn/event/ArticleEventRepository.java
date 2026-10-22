package kr.io.newlearn.event;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ArticleEventRepository extends JpaRepository<ArticleEvent, Long> {}
