package com.taxi.notification.internal;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.taxi.identity.UserDirectory;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

class PushDispatcherTest {

    private static final String EXPO = "https://expo.test/push";
    private final UUID customer = UUID.randomUUID();
    private final NotificationRepository repo = mock(NotificationRepository.class);
    private final UserDirectory users = mock(UserDirectory.class);
    private MockRestServiceServer expo;
    private PushDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        var builder = RestClient.builder();
        expo = MockRestServiceServer.bindTo(builder).build();
        dispatcher = new PushDispatcher(repo, users, JsonMapper.builder().build(), builder, EXPO, true);
        when(repo.unpushed(200)).thenReturn(List.of(new NotificationRepository.Notification(
                7, customer, UUID.randomUUID(), "price_proposed", "{\"price\": 30}", OffsetDateTime.now(), null)));
        when(repo.tokens(List.of(customer)))
                .thenReturn(List.of(new NotificationRepository.PushToken("ExponentPushToken[abc]", customer)));
        when(users.languages(any())).thenReturn(Map.of(customer, "en"));
    }

    @Test
    void sendsInTheRecipientsLanguageAndMarksAsPushed() {
        expo.expect(requestTo(EXPO)).andExpect(method(HttpMethod.POST))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("The driver proposes €30. Do you accept?")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("ExponentPushToken[abc]")))
                .andRespond(withSuccess("{\"data\":[{\"status\":\"ok\"}]}", MediaType.APPLICATION_JSON));

        dispatcher.dispatch();

        expo.verify();
        verify(repo).markPushed(List.of(7L));
    }

    @Test
    void forgetsTokensOfUninstalledApps() {
        expo.expect(requestTo(EXPO)).andRespond(withSuccess(
                "{\"data\":[{\"status\":\"error\",\"details\":{\"error\":\"DeviceNotRegistered\"}}]}",
                MediaType.APPLICATION_JSON));

        dispatcher.dispatch();

        verify(repo).deleteTokens(List.of("ExponentPushToken[abc]"));
    }

    @Test
    void retriesLaterWhenExpoIsDown() {
        expo.expect(requestTo(EXPO)).andRespond(withServerError());

        dispatcher.dispatch();

        verify(repo, never()).markPushed(any());
    }
}
