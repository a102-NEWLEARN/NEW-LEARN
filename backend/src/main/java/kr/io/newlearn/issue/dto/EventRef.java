package kr.io.newlearn.issue.dto;

import java.time.OffsetDateTime;

public record EventRef(long id, String title, String label, OffsetDateTime occurredAt) {}
