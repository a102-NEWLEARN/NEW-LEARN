package kr.io.newlearn.common;

import java.util.Collection;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

// 한 번에 읽은 행들을 번호로 찾게 — findAllById 뒤 후보 순서대로 돌며 꺼낼 때 쓴다. 같은 번호가 둘이면 IllegalStateException
public final class Rows {

    private Rows() {}

    public static <K, T> Map<K, T> byId(Collection<T> rows, Function<? super T, ? extends K> id) {
        return rows.stream().collect(Collectors.toMap(id, Function.identity()));
    }
}
