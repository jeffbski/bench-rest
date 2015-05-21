FROM hwestphal/nodebox
ADD ./ /bench-rest
USER nobody
CMD /bench-rest/bin/bench-rest -s -k $BR_KEY
